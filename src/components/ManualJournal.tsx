import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";
import { Button } from "./ui/Button";
import { Input } from "./ui/Input";
import { Select } from "./ui/Select";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/Card";
import { Badge } from "./ui/Badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/Table";
import { PageHeader } from "./ui/PageHeader";
import { Section } from "./ui/Section";
import { Icons } from "./ui/Icons";
import { Alert } from "./ui/Alert";
import { getErrorMessage } from "../lib/errors";

type Account = { id: string; code: string; name: string; account_type: string };
type Line = {
  account_id: string;
  debit: string;
  credit: string;
  memo: string;
};

export default function ManualJournal() {
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [lines, setLines] = useState<Line[]>([
    { account_id: "", debit: "", credit: "", memo: "" },
    { account_id: "", debit: "", credit: "", memo: "" },
  ]);
  const [journalDate, setJournalDate] = useState(
    new Date().toISOString().split("T")[0],
  );
  const [memo, setMemo] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    const loadAccounts = async () => {
      const { data, error } = await supabase
        .from("accounts")
        .select("id, code, name, account_type")
        .eq("is_active", true)
        .order("code", { ascending: true });
      if (error) {
        setError(getErrorMessage(error, "Failed to load accounts"));
        return;
      }
      setAccounts(data || []);
    };
    loadAccounts();
  }, []);

  const totals = useMemo(() => {
    const toNum = (v: string) => (v === "" ? 0 : Number(v));
    const debit = lines.reduce((sum, l) => sum + toNum(l.debit), 0);
    const credit = lines.reduce((sum, l) => sum + toNum(l.credit), 0);
    return { debit, credit, balanced: Math.abs(debit - credit) < 0.01 };
  }, [lines]);

  const updateLine = (index: number, patch: Partial<Line>) => {
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  };

  const addLine = () => {
    setLines((prev) => [...prev, { account_id: "", debit: "", credit: "", memo: "" }]);
  };

  const removeLine = (index: number) => {
    setLines((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    setError(null);
    setSuccess(null);
    const payload = lines
      .filter((l) => l.account_id)
      .map((l) => ({
        account_id: l.account_id,
        debit: l.debit === "" ? 0 : Number(l.debit),
        credit: l.credit === "" ? 0 : Number(l.credit),
        memo: l.memo?.trim() || null,
      }));

    if (!journalDate) {
      setError("Tanggal jurnal wajib diisi");
      return;
    }
    if (!memo.trim()) {
      setError("Memo wajib diisi");
      return;
    }
    if (payload.length < 2) {
      setError("Minimal 2 baris jurnal (double entry)");
      return;
    }
    if (!totals.balanced) {
      setError("Debit dan credit harus seimbang");
      return;
    }

    setLoading(true);
    try {
      const { error: rpcError } = await supabase.rpc("rpc_create_manual_journal", {
        p_journal_date: journalDate,
        p_memo: memo,
        p_lines: payload,
      });
      if (rpcError) throw rpcError;
      setSuccess("Jurnal manual berhasil dibuat.");
      setMemo("");
      setLines([
        { account_id: "", debit: "", credit: "", memo: "" },
        { account_id: "", debit: "", credit: "", memo: "" },
      ]);
      // Redirect to list
      navigate("/journals");
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Gagal membuat jurnal manual"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-6xl mx-auto space-y-6 px-3 sm:px-4 lg:px-6 pb-20">
      <PageHeader
        title="Jurnal Umum"
        description="Input jurnal operasional harian (manual)."
        breadcrumbs={[{ label: "Dashboard", href: "/" }, { label: "Finance" }, { label: "Jurnal Umum" }]}
      />

      <Alert
        variant="warning"
        title="Perhatian"
        description="Jurnal Umum dipakai untuk transaksi operasional harian (gaji, biaya, koreksi). Pastikan debit = credit, akun sesuai COA, dan tanggal berada di periode OPEN."
      />

      {error && <Alert variant="error" title="Oops" description={error} />}
      {success && <Alert variant="success" title="Sukses" description={success} />}

      <Section title="Header" description="Tanggal dan catatan jurnal">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Input
            label="Tanggal"
            type="date"
            value={journalDate}
            onChange={(e) => setJournalDate(e.target.value)}
            containerClassName="!mb-0"
          />
          <Input
            label="Memo"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="Contoh: Gaji Bulan Februari (Wajib diisi)"
            required
            containerClassName="md:col-span-2 !mb-0"
          />
        </div>
      </Section>

      <Card>
        <CardHeader>
          <CardTitle>Line Items</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Table>
            <TableHeader className="bg-gray-50">
              <TableRow>
                <TableHead>Account</TableHead>
                <TableHead className="text-right">Debit</TableHead>
                <TableHead className="text-right">Credit</TableHead>
                <TableHead>Memo</TableHead>
                <TableHead className="w-10"><span className="sr-only">No</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map((line, index) => (
                <TableRow key={index}>
                  <TableCell className="min-w-[240px]">
                    <Select
                      value={line.account_id}
                      onChange={(e) => updateLine(index, { account_id: e.target.value })}
                      options={[
                        { label: "-- Select Account --", value: "" },
                        ...accounts.map((a) => ({
                          label: `${a.code} - ${a.name} (${a.account_type || 'ASSET'})`,
                          value: a.id,
                          searchText: `${a.code} ${a.name} ${a.account_type || 'ASSET'}`,
                          content: (
                            <div className="flex items-center justify-between w-full gap-3">
                              <span className="text-sm font-medium text-slate-700">{a.code} - {a.name}</span>
                              <Badge variant="outline" className="text-[10px] uppercase tracking-wide px-2 py-0.5">{a.account_type || 'ASSET'}</Badge>
                            </div>
                          )
                        })),
                      ]}
                      className="!mb-0"
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <Input
                      type="number"
                      inputMode="decimal"
                      step="1"
                      placeholder="0"
                      value={line.debit}
                      onChange={(e) => updateLine(index, { debit: e.target.value, credit: line.credit ? "" : line.credit })}
                      className="text-right w-28"
                      containerClassName="!mb-0"
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <Input
                      type="number"
                      inputMode="decimal"
                      step="1"
                      placeholder="0"
                      value={line.credit}
                      onChange={(e) => updateLine(index, { credit: e.target.value, debit: line.debit ? "" : line.debit })}
                      className="text-right w-28"
                      containerClassName="!mb-0"
                    />
                  </TableCell>
                  <TableCell className="min-w-[200px]">
                    <Input
                      placeholder="Optional"
                      value={line.memo}
                      onChange={(e) => updateLine(index, { memo: e.target.value })}
                      containerClassName="!mb-0"
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeLine(index)}
                      icon={<Icons.Trash className="w-4 h-4" />}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <Button variant="outline" onClick={addLine} icon={<Icons.Plus className="w-4 h-4" />}>
              Add Line
            </Button>
            <div className={`text-sm ${totals.balanced ? "text-green-700" : "text-red-600"}`}>
              Debit: {totals.debit.toLocaleString("id-ID")} • Credit: {totals.credit.toLocaleString("id-ID")}{" "}
              {!totals.balanced && "(Not Balanced)"}
            </div>
          </div>

          <div className="flex justify-end">
            <Button onClick={handleSubmit} disabled={loading}>
              {loading ? "Saving..." : "Save Journal"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
