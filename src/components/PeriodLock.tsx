import { useEffect, useState, useCallback } from "react";
import { supabase } from "../supabaseClient";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/Card";
import { Button } from "./ui/Button";
import { Input } from "./ui/Input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./ui/Table";
import { Alert } from "./ui/Alert";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/Dialog";
import { getErrorMessage } from "../lib/errors";
import { StatusBadge } from "./ui/StatusBadge";
import { formatCurrency } from "../lib/format";
import { useConfirm } from "./ui/ConfirmDialogContext";

type Period = {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  status: "OPEN" | "CLOSED";
  updated_at: string;
};

type ExportLog = {
  id: string;
  report_type: string;
  exported_at: string | null;
  notes: string;
};

type AccountBalance = {
  id: string;
  code: string;
  name: string;
  opening_balance: number;
  debit_movement: number;
  credit_movement: number;
  closing_balance: number;
};

type GLLine = {
  journal_date: string;
  ref_type: string | null;
  ref_no: string | null;
  memo: string | null;
  account_code: string | null;
  account_name: string | null;
  debit: number | null;
  credit: number | null;
};

type JournalLineRow = {
  debit: number | null;
  credit: number | null;
  account:
  | { code: string | null; name: string | null }
  | { code: string | null; name: string | null }[]
  | null;
  journal:
  | {
    journal_date: string | null;
    ref_type: string | null;
    ref_id: string | null;
    memo: string | null;
  }
  | {
    journal_date: string | null;
    ref_type: string | null;
    ref_id: string | null;
    memo: string | null;
  }[]
  | null;
};

type PeriodInfo = {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
};

const toCsv = <T extends Record<string, string | number | null>>(rows: T[]) => {
  const headers = rows.length ? Object.keys(rows[0]) : [];
  const escape = (value: string | number | null) => {
    if (value === null || value === undefined) return "";
    const str = String(value);
    if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
    return str;
  };
  const lines = [
    headers.join(","),
    ...rows.map((row) => headers.map((key) => escape(row[key])).join(",")),
  ];
  return lines.join("\n");
};

const downloadCsv = (filename: string, csv: string) => {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};

const openPdfPrintWindow = (title: string, period: PeriodInfo, bodyHtml: string) => {
  const win = window.open("", "_blank");
  if (!win) return;
  const css = `
    @page { size: A4; margin: 16mm; }
    body { font-family: "Inter", Arial, sans-serif; color: #0f172a; }
    h1 { font-size: 18px; margin: 0 0 6px; }
    .meta { font-size: 12px; color: #475569; margin-bottom: 16px; display: flex; justify-content: space-between; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; }
    th, td { padding: 6px 8px; border-bottom: 1px solid #e2e8f0; }
    th { text-align: left; background: #f8fafc; font-weight: 600; }
    .num { text-align: right; font-variant-numeric: tabular-nums; }
    .section { margin-top: 16px; }
  `;
  win.document.write(`
    <html>
      <head>
        <title>${title}</title>
        <style>${css}</style>
      </head>
      <body>
        <h1>${title}</h1>
        <div class="meta">
          <div>Period: ${period.start_date} – ${period.end_date}</div>
          <div>${period.name}</div>
        </div>
        ${bodyHtml}
      </body>
    </html>
  `);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 300);
};

export default function PeriodLock() {
  const [periods, setPeriods] = useState<Period[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Form
  const buildCurrentPeriodDefaults = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth(); // 0-11

    // Start: 1st of current month
    const start = new Date(year, month, 1);
    // End: 0th of next month = last day of current month
    const end = new Date(year, month + 1, 0);

    // Format YYYY-MM-DD using local time
    const toLocalYMD = (d: Date) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${y}-${m}-${day}`;
    };

    const name = start.toLocaleDateString("id-ID", {
      month: "long",
      year: "numeric",
    });
    return {
      name,
      start_date: toLocalYMD(start),
      end_date: toLocalYMD(end),
    };
  };

  const [formData, setFormData] = useState(buildCurrentPeriodDefaults);

  // Exports
  const [selectedPeriodId, setSelectedPeriodId] = useState("");
  const [logs, setLogs] = useState<ExportLog[]>([]);
  const [closeModalOpen, setCloseModalOpen] = useState(false);
  const [closingPeriod, setClosingPeriod] = useState<Period | null>(null);
  const [closingAmount, setClosingAmount] = useState<number | null>(null);
  const [closingSkipped, setClosingSkipped] = useState(false);
  const [closingLoading, setClosingLoading] = useState(false);
  const [closingError, setClosingError] = useState<string | null>(null);
  const { confirm } = useConfirm();

  // -- 1. PERIODS OPS --
  // Wrap in useCallback to allow usage in useEffect dependency
  const fetchPeriods = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("accounting_periods")
      .select("*")
      .order("start_date", { ascending: false });

    if (error) setError(error.message);
    else setPeriods(data || []);
    setLoading(false);
  }, []);

  async function handleCreate() {
    if (!formData.name || !formData.start_date || !formData.end_date) {
      setError("All fields required");
      return;
    }
    setError(null);
    setSuccess(null);

    const { error } = await supabase.rpc("rpc_create_period", {
      p_name: formData.name,
      p_start_date: formData.start_date,
      p_end_date: formData.end_date,
    });

    if (error) setError(error.message);
    else {
      setSuccess("Period Created");
      setFormData(buildCurrentPeriodDefaults());
      fetchPeriods();
    }
  }

  async function toggleStatus(p: Period) {
    if (p.status === "OPEN") {
      await openCloseModal(p);
      return;
    }

    const ok = await confirm({
      title: "Re-open Period",
      description: "Re-open this period? This will allow new transactions.",
      confirmText: "Re-open",
      cancelText: "Cancel",
      tone: "danger",
    });
    if (!ok) return;
    const { error } = await supabase.rpc("rpc_set_period_status", {
      p_period_id: p.id,
      p_status: "OPEN",
    });
    if (error) setError(error.message);
    else fetchPeriods();
  }

  // -- 2. EXPORTS OPS --
  const fetchLogs = useCallback(async (periodId: string) => {
    setSelectedPeriodId(periodId);
    const { data, error } = await supabase
      .from("period_exports")
      .select("*")
      .eq("period_id", periodId)
      .order("exported_at", { ascending: false });

    if (error) setError(error.message);
    else setLogs(data || []);
  }, []);

  const fetchPeriodInfo = useCallback(async () => {
    if (!selectedPeriodId) return null;
    const { data, error } = await supabase
      .from("accounting_periods")
      .select("id,name,start_date,end_date")
      .eq("id", selectedPeriodId)
      .single();
    if (error) {
      setError(error.message);
      return null;
    }
    return data as PeriodInfo;
  }, [selectedPeriodId]);

  const openCloseModal = async (p: Period) => {
    setClosingPeriod(p);
    setCloseModalOpen(true);
    setClosingError(null);
    setClosingAmount(null);
    setClosingSkipped(false);
    setClosingLoading(true);
    try {
      const { data, error } = await supabase.rpc("rpc_get_account_balances", {
        p_start_date: p.start_date,
        p_end_date: p.end_date,
      });
      if (error) throw error;
      const row = (data || []).find((r: { code: string }) => r.code === "1310");
      if (!row) {
        throw new Error("Persediaan Bahan Baku (1310) tidak ditemukan di Trial Balance.");
      }
      const amount = Number(row.closing_balance) || 0;
      setClosingAmount(amount);
      setClosingSkipped(amount === 0);
    } catch (err: unknown) {
      setClosingError(getErrorMessage(err));
    } finally {
      setClosingLoading(false);
    }
  };

  const handleCloseAndLock = async () => {
    if (!closingPeriod) return;
    setClosingLoading(true);
    setClosingError(null);
    try {
      const { data: existingClose, error: existingError } = await supabase
        .from("journals")
        .select("id")
        .eq("ref_type", "period_close_hpp")
        .eq("ref_id", closingPeriod.id)
        .limit(1);
      if (existingError) throw existingError;

      const shouldClose =
        (!existingClose || existingClose.length === 0) &&
        (closingAmount ?? 0) > 0;
      if (shouldClose) {
        const { error: closeError } = await supabase.rpc("rpc_close_period_hpp", {
          p_period_id: closingPeriod.id,
        });
        if (closeError) throw closeError;
      }

      const { error: lockError } = await supabase.rpc("rpc_set_period_status", {
        p_period_id: closingPeriod.id,
        p_status: "CLOSED",
      });
      if (lockError) throw lockError;

      if (shouldClose) {
        setSuccess("Closing HPP dibuat dan periode berhasil di-lock.");
      } else if (existingClose && existingClose.length > 0) {
        setSuccess("Periode berhasil di-lock (closing HPP sudah ada).");
      } else {
        setSuccess("Periode berhasil di-lock (closing HPP tidak dibuat karena saldo 0).");
      }
      setCloseModalOpen(false);
      fetchPeriods();
    } catch (err: unknown) {
      setClosingError(getErrorMessage(err));
    } finally {
      setClosingLoading(false);
    }
  };

  async function handleExport(type: string, format: "CSV" | "PDF" = "CSV") {
    if (!selectedPeriodId) return;
    setError(null);
    const periodInfo = await fetchPeriodInfo();
    if (!periodInfo) return;

    const baseName = `${type}_${periodInfo.name}_${periodInfo.start_date}_${periodInfo.end_date}`;
    try {
      if (type === "TB" || type === "PL") {
        const { data, error } = await supabase.rpc("rpc_get_account_balances", {
          p_start_date: periodInfo.start_date,
          p_end_date: periodInfo.end_date,
        });
        if (error) throw error;
        const balances = (data || []) as AccountBalance[];

        const tbRows = balances.map((row) => ({
          code: row.code,
          name: row.name,
          opening_balance: row.opening_balance,
          debit_movement: row.debit_movement,
          credit_movement: row.credit_movement,
          closing_balance: row.closing_balance,
        }));

        const plRows = balances
          .filter((row) =>
            ["4", "5", "6", "7", "8", "9"].some((prefix) =>
              row.code?.startsWith(prefix)
            )
          )
          .map((row) => ({
            code: row.code,
            name: row.name,
            closing_balance: row.closing_balance,
          }));

        const rows = type === "TB" ? tbRows : plRows;

        if (format === "CSV") {
          const csv = toCsv(rows);
          downloadCsv(`${baseName}.csv`, csv);
        } else {
          if (type === "TB") {
            const header =
              "<tr><th>Code</th><th>Name</th><th class='num'>Opening</th><th class='num'>Debit</th><th class='num'>Credit</th><th class='num'>Closing</th></tr>";
            const body = tbRows
              .map(
                (row) => `<tr>
                  <td>${row.code}</td>
                  <td>${row.name}</td>
                  <td class="num">${row.opening_balance}</td>
                  <td class="num">${row.debit_movement}</td>
                  <td class="num">${row.credit_movement}</td>
                  <td class="num">${row.closing_balance}</td>
                </tr>`
              )
              .join("");
            openPdfPrintWindow(
              "Trial Balance",
              periodInfo,
              `<table>${header}${body}</table>`
            );
          } else {
            const header =
              "<tr><th>Code</th><th>Name</th><th class='num'>Amount</th></tr>";
            const body = plRows
              .map(
                (row) => `<tr>
                <td>${row.code}</td>
                <td>${row.name}</td>
                <td class="num">${row.closing_balance}</td>
              </tr>`
              )
              .join("");
            openPdfPrintWindow(
              "Profit & Loss",
              periodInfo,
              `<table>${header}${body}</table>`
            );
          }
        }
      } else if (type === "GL") {
        const { data, error } = await supabase
          .from("journal_lines")
          .select(
            "debit,credit,account:accounts(code,name),journal:journals(journal_date,ref_type,ref_id,memo)"
          )
          .gte("journal.journal_date", periodInfo.start_date)
          .lte("journal.journal_date", periodInfo.end_date)
          .order("journal_date", { foreignTable: "journals", ascending: true });
        if (error) throw error;

        const rows = (data || []).map((row: JournalLineRow) => {
          const journal = Array.isArray(row.journal)
            ? row.journal[0]
            : row.journal;
          const account = Array.isArray(row.account)
            ? row.account[0]
            : row.account;
          return {
            journal_date: journal?.journal_date || "",
            ref_type: journal?.ref_type || "",
            ref_no: journal?.ref_id || "",
            memo: journal?.memo || "",
            account_code: account?.code || "",
            account_name: account?.name || "",
            debit: row.debit ?? 0,
            credit: row.credit ?? 0,
          };
        }) as GLLine[];

        if (format === "CSV") {
          const csv = toCsv(rows);
          downloadCsv(`${baseName}.csv`, csv);
        } else {
          const header =
            "<tr><th>Date</th><th>Ref Type</th><th>Ref ID</th><th>Memo</th><th>Account</th><th class='num'>Debit</th><th class='num'>Credit</th></tr>";
          const body = rows
            .map(
              (row) => `<tr>
                <td>${row.journal_date || ""}</td>
                <td>${row.ref_type || ""}</td>
                <td>${row.ref_no || ""}</td>
                <td>${row.memo || ""}</td>
                <td>${row.account_code || ""} ${row.account_name || ""}</td>
                <td class="num">${row.debit ?? 0}</td>
                <td class="num">${row.credit ?? 0}</td>
              </tr>`
            )
            .join("");
          openPdfPrintWindow(
            "General Ledger",
            periodInfo,
            `<table>${header}${body}</table>`
          );
        }
      }

      const { error: logError } = await supabase.rpc(
        "rpc_export_period_reports",
        {
          p_period_id: selectedPeriodId,
          p_report_type: `${type}_${format}`,
          p_notes: "Manual Export via UI",
        }
      );
      if (logError) setError(logError.message);
      fetchLogs(selectedPeriodId);
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    }
  }

  // Use effects at the end of definitions
  useEffect(() => {
    fetchPeriods();
  }, [fetchPeriods]);

  return (
    <div className="w-full space-y-8">
      <h2 className="hidden md:block text-3xl font-bold tracking-tight text-gray-900">
        Period Management
      </h2>

      {error && <Alert variant="error" title="Kesalahan" description={error} />}
      {success && (
        <Alert variant="success" title="Berhasil" description={success} />
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-8">
        <Card className="md:col-span-1 shadow-md h-fit">
          <CardHeader className="bg-gray-50 border-b border-gray-100">
            <CardTitle>Create Accounting Period</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 pt-6">
            <Input
              label="Name (e.g. 2024-01)"
              value={formData.name}
              onChange={(e) =>
                setFormData({ ...formData, name: e.target.value })
              }
              placeholder="YYYY-MM"
            />
            <Input
              label="Start Date"
              type="date"
              value={formData.start_date}
              onChange={(e) =>
                setFormData({ ...formData, start_date: e.target.value })
              }
            />
            <Input
              label="End Date"
              type="date"
              value={formData.end_date}
              onChange={(e) =>
                setFormData({ ...formData, end_date: e.target.value })
              }
            />
            <Button
              className="w-full bg-blue-600 hover:bg-blue-700"
              onClick={handleCreate}
              disabled={loading}
            >
              Create Period
            </Button>
          </CardContent>
        </Card>

        <Card className="md:col-span-2 shadow-md">
          <CardHeader className="bg-gray-50 border-b border-gray-100">
            <CardTitle>Existing Periods</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Start</TableHead>
                    <TableHead>End</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {periods.map((p) => (
                    <TableRow
                      key={p.id}
                      className={
                        p.status === "CLOSED" ? "bg-gray-50 opacity-75" : ""
                      }
                    >
                      <TableCell className="font-medium">{p.name}</TableCell>
                      <TableCell>{p.start_date}</TableCell>
                      <TableCell>{p.end_date}</TableCell>
                      <TableCell>
                        <StatusBadge status={p.status} />
                      </TableCell>
                      <TableCell className="flex gap-2">
                        <Button
                          size="sm"
                          variant={p.status === "OPEN" ? "danger" : "outline"}
                          onClick={() => toggleStatus(p)}
                        >
                          {p.status === "OPEN" ? "Close HPP & Lock" : "Re-open"}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => fetchLogs(p.id)}
                        >
                          Exports
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      {selectedPeriodId && (
        <Card className="shadow-md border-blue-200">
          <CardHeader className="bg-blue-50 border-b border-blue-100">
            <CardTitle className="text-blue-900">
              Export Management for Selected Period
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="flex flex-wrap gap-4 mb-6">
              <Button
                onClick={() => handleExport("GL", "CSV")}
                className="bg-indigo-600 hover:bg-indigo-700 text-white"
              >
                Export GL (CSV)
              </Button>
              <Button
                onClick={() => handleExport("TB", "CSV")}
                className="bg-indigo-600 hover:bg-indigo-700 text-white"
              >
                Export Trial Balance (CSV)
              </Button>
              <Button
                onClick={() => handleExport("PL", "CSV")}
                className="bg-indigo-600 hover:bg-indigo-700 text-white"
              >
                Export P&L (CSV)
              </Button>
              <Button
                onClick={() => handleExport("GL", "PDF")}
                variant="outline"
              >
                Export GL (PDF)
              </Button>
              <Button
                onClick={() => handleExport("TB", "PDF")}
                variant="outline"
              >
                Export Trial Balance (PDF)
              </Button>
              <Button
                onClick={() => handleExport("PL", "PDF")}
                variant="outline"
              >
                Export P&L (PDF)
              </Button>
            </div>

            <h4 className="font-semibold text-gray-700 mb-2">Export Logs</h4>
            <div className="rounded-md border border-gray-200 overflow-hidden">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-gray-50">
                    <TableRow>
                      <TableHead>Timestamp</TableHead>
                      <TableHead>Report</TableHead>
                      <TableHead>Notes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {logs.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={3}
                          className="text-center text-gray-400 italic"
                        >
                          No exports recorded
                        </TableCell>
                      </TableRow>
                    ) : (
                      logs.map((log) => (
                        <TableRow key={log.id}>
                          <TableCell>
                            {log.exported_at
                              ? new Date(log.exported_at).toLocaleString()
                              : "Timestamp unavailable"}
                          </TableCell>
                          <TableCell className="font-mono">
                            {log.report_type}
                          </TableCell>
                          <TableCell>{log.notes}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog isOpen={closeModalOpen} onClose={() => setCloseModalOpen(false)}>
        <DialogHeader>
          <DialogTitle>Closing HPP Bulanan</DialogTitle>
        </DialogHeader>
        <DialogContent className="sm:max-w-lg">
          <div className="space-y-4 text-sm text-slate-700">
            <p>
              Periode:{" "}
              <span className="font-semibold">
                {closingPeriod?.name} ({closingPeriod?.start_date} – {closingPeriod?.end_date})
              </span>
            </p>
            {closingError && (
              <Alert variant="error" title="Error" description={closingError} />
            )}
            <div className="rounded-lg border border-slate-200 p-3 bg-slate-50">
              <div className="flex items-center justify-between">
                <span>Debit 5100 - HPP</span>
                <span className="font-semibold">
                  {closingAmount !== null ? formatCurrency(closingAmount) : "-"}
                </span>
              </div>
              <div className="flex items-center justify-between mt-2">
                <span>Credit 1310 - Persediaan Bahan Baku</span>
                <span className="font-semibold">
                  {closingAmount !== null ? formatCurrency(closingAmount) : "-"}
                </span>
              </div>
              {closingSkipped && (
                <div className="mt-3 text-xs text-amber-600">
                  Skipped (saldo 0)
                </div>
              )}
            </div>
            <p className="text-xs text-slate-500">
              Nilai diambil otomatis dari saldo Trial Balance akun 1310 pada periode ini.
            </p>
          </div>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => setCloseModalOpen(false)} disabled={closingLoading}>
              Cancel
            </Button>
            <Button onClick={handleCloseAndLock} disabled={closingLoading || closingAmount === null}>
              {closingLoading ? "Processing..." : "Create Closing & Lock"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
