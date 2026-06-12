import { useCallback, useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";
import { Button } from "./ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/Card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/Table";
import { Badge } from "./ui/Badge";
import { Icons } from "./ui/Icons";
import { Alert } from "./ui/Alert";
import { PageHeader } from "./ui/PageHeader";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/Dialog";
import { formatCurrency, formatDate } from "../lib/format";
import { useConfirm } from "./ui/ConfirmDialogContext";
import MakloonMaterialIssueForm from "./MakloonMaterialIssueForm";
import MakloonReceiptForm from "./MakloonReceiptForm";

type Order = {
  id: string;
  order_no: string | null;
  order_date: string;
  expected_completion_date: string | null;
  status: string;
  notes: string | null;
  total_jasa: number;
  vendor: { name: string } | null;
};

type OrderItem = {
  id: string;
  item_name: string;
  uom_snapshot: string;
  qty_ordered: number;
  jasa_per_unit: number;
  subtotal_jasa: number;
};

type OrderItemRow = {
  id: string;
  item_id: string;
  uom_snapshot: string;
  qty_ordered: number;
  jasa_per_unit: number;
  subtotal_jasa: number;
};

type ItemNameRow = {
  id: string;
  name: string;
};

type Issue = {
  id: string;
  issue_no: string | null;
  issue_date: string;
  status: string;
  item_count?: number;
  total_qty?: number;
};

type Receipt = {
  id: string;
  receipt_no: string | null;
  receipt_date: string;
  status: string;
  total_jasa: number;
  item_count?: number;
  total_qty?: number;
};

type DocumentLine = {
  id: string;
  item_name: string;
  uom: string;
  qty: number;
  jasa_per_unit?: number;
  subtotal_jasa?: number;
};

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-700",
  ISSUED: "bg-blue-100 text-blue-700",
  IN_PRODUCTION: "bg-yellow-100 text-yellow-800",
  COMPLETED: "bg-green-100 text-green-700",
  CANCELLED: "bg-red-100 text-red-700",
  POSTED: "bg-green-100 text-green-700",
};

const WORKFLOW_STEPS = [
  { id: "DRAFT", label: "Draft", description: "Order dibuat" },
  { id: "ISSUED", label: "Dikonfirmasi", description: "Order dikonfirmasi" },
  { id: "IN_PRODUCTION", label: "Produksi", description: "Bahan dikirim" },
  { id: "COMPLETED", label: "Selesai", description: "FG diterima" },
];

function getCurrentStepIndex(status: string): number {
  const index = WORKFLOW_STEPS.findIndex((s) => s.id === status);
  return index >= 0 ? index : 0;
}

function WorkflowProgress({ status }: { status: string }) {
  const currentStep = getCurrentStepIndex(status);
  const isCompleted = status === "COMPLETED" || status === "CANCELLED";

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="grid gap-3 md:grid-cols-4">
          {WORKFLOW_STEPS.map((step, index) => {
            const isDone = index < currentStep || isCompleted;
            const isCurrent = index === currentStep;

            return (
              <div
                key={step.id}
                className={`rounded-xl border p-4 ${
                  isDone
                    ? "border-green-200 bg-green-50"
                    : isCurrent
                      ? "border-blue-200 bg-blue-50"
                      : "border-gray-200 bg-white"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold ${
                      isDone
                        ? "bg-green-500 text-white"
                        : isCurrent
                          ? "bg-blue-500 text-white"
                          : "bg-gray-100 text-gray-400"
                    }`}
                  >
                    {isDone ? <Icons.Check className="h-5 w-5" /> : index + 1}
                  </div>
                  <div>
                    <div className="font-semibold">{step.label}</div>
                    <div className="text-xs text-gray-500">{step.description}</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

export { WorkflowProgress };

export default function MakloonOrderDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { confirm } = useConfirm();

  const [order, setOrder] = useState<Order | null>(null);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [issueFormOpen, setIssueFormOpen] = useState(false);
  const [receiptFormOpen, setReceiptFormOpen] = useState(false);
  const [activeIssue, setActiveIssue] = useState<Issue | null>(null);
  const [activeReceipt, setActiveReceipt] = useState<Receipt | null>(null);
  const [documentLines, setDocumentLines] = useState<DocumentLine[]>([]);
  const [documentLoading, setDocumentLoading] = useState(false);

  const fetchAll = useCallback(async () => {
    if (!id) return;

    const [oRes, iRes, issRes, rRes] = await Promise.all([
      supabase.from("makloon_orders").select("*, vendors(name)").eq("id", id).single(),
      supabase
        .from("makloon_order_items")
        .select("id, item_id, uom_snapshot, qty_ordered, jasa_per_unit, subtotal_jasa")
        .eq("makloon_order_id", id),
      supabase
        .from("makloon_material_issues")
        .select("id, issue_no, issue_date, status")
        .eq("makloon_order_id", id)
        .order("issue_date", { ascending: false }),
      supabase
        .from("makloon_receipts")
        .select("id, receipt_no, receipt_date, status, total_jasa")
        .eq("makloon_order_id", id)
        .order("receipt_date", { ascending: false }),
    ]);

    if (oRes.error) {
      setError("Order tidak ditemukan");
      return;
    }

    const oData = oRes.data as Record<string, unknown>;
    const orderItems = (iRes.data as OrderItemRow[]) || [];
    const itemIds = [...new Set(orderItems.map((item) => item.item_id))];
    const itemNameMap = new Map<string, string>();

    if (itemIds.length > 0) {
      const { data: itemRows } = await supabase.from("items").select("id, name").in("id", itemIds);
      ((itemRows as ItemNameRow[]) || []).forEach((item) => itemNameMap.set(item.id, item.name));
    }

    const issueRows = ((issRes.data as Issue[]) || []).map((issue) => ({ ...issue, item_count: 0, total_qty: 0 }));
    const receiptRows = ((rRes.data as Receipt[]) || []).map((receipt) => ({ ...receipt, item_count: 0, total_qty: 0 }));

    if (issueRows.length > 0) {
      const issueIds = issueRows.map((issue) => issue.id);
      const { data: issueItems } = await supabase.from("makloon_issue_items").select("issue_id, qty").in("issue_id", issueIds);
      issueRows.forEach((issue) => {
        const rows = ((issueItems as { issue_id: string; qty: number }[]) || []).filter((row) => row.issue_id === issue.id);
        issue.item_count = rows.length;
        issue.total_qty = rows.reduce((sum, row) => sum + Number(row.qty || 0), 0);
      });
    }

    if (receiptRows.length > 0) {
      const receiptIds = receiptRows.map((receipt) => receipt.id);
      const { data: receiptItems } = await supabase.from("makloon_receipt_items").select("receipt_id, qty_received").in("receipt_id", receiptIds);
      receiptRows.forEach((receipt) => {
        const rows = ((receiptItems as { receipt_id: string; qty_received: number }[]) || []).filter((row) => row.receipt_id === receipt.id);
        receipt.item_count = rows.length;
        receipt.total_qty = rows.reduce((sum, row) => sum + Number(row.qty_received || 0), 0);
      });
    }

    setOrder({
      ...oData,
      vendor: (oData.vendors as { name?: string } | null) || null,
    } as Order);
    setItems(
      orderItems.map((item) => ({
        id: item.id,
        item_name: itemNameMap.get(item.item_id) || "-",
        uom_snapshot: item.uom_snapshot,
        qty_ordered: item.qty_ordered,
        jasa_per_unit: item.jasa_per_unit,
        subtotal_jasa: item.subtotal_jasa,
      })),
    );
    setIssues(issueRows);
    setReceipts(receiptRows);
  }, [id]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const handleUpdateStatus = async (newStatus: string) => {
    const { error } = await supabase.from("makloon_orders").update({ status: newStatus }).eq("id", id);
    if (error) {
      alert(error.message);
    } else {
      await fetchAll();
    }
  };

  const handleCancelOrder = async () => {
    const confirmed = await confirm({
      title: "Batalkan Order?",
      description: "Order ini akan dibatalkan dan tidak dapat diproses lagi. Apakah Anda yakin?",
      confirmText: "Ya, Batalkan",
      cancelText: "Tidak",
    });
    if (!confirmed) return;

    const { error } = await supabase.from("makloon_orders").update({ status: "CANCELLED" }).eq("id", id);
    if (error) alert(error.message);
    else await fetchAll();
  };

  const handleDeleteOrder = async () => {
    const confirmed = await confirm({
      title: "Hapus Draft?",
      description: "Draft order ini akan dihapus secara permanen. Apakah Anda yakin?",
      confirmText: "Ya, Hapus",
      cancelText: "Batal",
    });
    if (!confirmed) return;

    const { error } = await supabase.from("makloon_orders").delete().eq("id", id);
    if (error) alert(error.message);
    else navigate("/makloon/orders");
  };

  const closeFormModal = async () => {
    setIssueFormOpen(false);
    setReceiptFormOpen(false);
    await fetchAll();
  };

  const openIssueDetail = async (issue: Issue) => {
    setActiveIssue(issue);
    setActiveReceipt(null);
    setDocumentLines([]);
    setDocumentLoading(true);

    const { data } = await supabase.from("makloon_issue_items").select("id, item_id, uom_snapshot, qty").eq("issue_id", issue.id);
    const rows = (data as { id: string; item_id: string; uom_snapshot: string; qty: number }[]) || [];
    const itemIds = rows.map((row) => row.item_id);
    const itemMap = new Map<string, string>();

    if (itemIds.length > 0) {
      const { data: itemRows } = await supabase.from("items").select("id, name").in("id", itemIds);
      ((itemRows as ItemNameRow[]) || []).forEach((item) => itemMap.set(item.id, item.name));
    }

    setDocumentLines(
      rows.map((row) => ({
        id: row.id,
        item_name: itemMap.get(row.item_id) || "-",
        uom: row.uom_snapshot,
        qty: row.qty,
      })),
    );
    setDocumentLoading(false);
  };

  const openReceiptDetail = async (receipt: Receipt) => {
    setActiveReceipt(receipt);
    setActiveIssue(null);
    setDocumentLines([]);
    setDocumentLoading(true);

    const { data } = await supabase
      .from("makloon_receipt_items")
      .select("id, item_id, uom_snapshot, qty_received, jasa_per_unit, subtotal_jasa")
      .eq("receipt_id", receipt.id);
    const rows = (data as { id: string; item_id: string; uom_snapshot: string; qty_received: number; jasa_per_unit: number; subtotal_jasa: number }[]) || [];
    const itemIds = rows.map((row) => row.item_id);
    const itemMap = new Map<string, string>();

    if (itemIds.length > 0) {
      const { data: itemRows } = await supabase.from("items").select("id, name").in("id", itemIds);
      ((itemRows as ItemNameRow[]) || []).forEach((item) => itemMap.set(item.id, item.name));
    }

    setDocumentLines(
      rows.map((row) => ({
        id: row.id,
        item_name: itemMap.get(row.item_id) || "-",
        uom: row.uom_snapshot,
        qty: row.qty_received,
        jasa_per_unit: row.jasa_per_unit,
        subtotal_jasa: row.subtotal_jasa,
      })),
    );
    setDocumentLoading(false);
  };

  const closeDocumentModal = () => {
    setActiveIssue(null);
    setActiveReceipt(null);
    setDocumentLines([]);
  };

  if (error) return <Alert variant="error" title="Error" description={error} />;
  if (!order) return <div className="p-8 text-center text-gray-500">Loading...</div>;

  const nextAction = (() => {
    if (order.status === "DRAFT") return { label: "Konfirmasi Order", action: () => handleUpdateStatus("ISSUED"), icon: <Icons.Check className="h-4 w-4" /> };
    if (order.status === "ISSUED") return { label: "Kirim Bahan", action: () => setIssueFormOpen(true), icon: <Icons.Package className="h-4 w-4" /> };
    if (order.status === "IN_PRODUCTION") return { label: "Terima FG", action: () => setReceiptFormOpen(true), icon: <Icons.Check className="h-4 w-4" /> };
    return null;
  })();

  return (
    <div className="w-full space-y-6 pb-20">
      <PageHeader
        title={`Makloon Order ${order.order_no || order.id.substring(0, 8)}`}
        breadcrumbs={[{ label: "Makloon", href: "/makloon" }, { label: "Workspace" }]}
        actions={
          <div className="flex flex-wrap gap-2">
            {order.status === "DRAFT" && (
              <>
                <Button variant="outline" onClick={() => navigate(`/makloon/${id}/edit`)} icon={<Icons.Edit className="h-4 w-4" />}>
                  Edit Draft
                </Button>
                <Button variant="ghost" className="text-red-600 hover:bg-red-50" onClick={handleDeleteOrder} icon={<Icons.Trash className="h-4 w-4" />}>
                  Hapus
                </Button>
              </>
            )}
            {(order.status === "ISSUED" || order.status === "IN_PRODUCTION") && (
              <Button variant="danger" onClick={handleCancelOrder} icon={<Icons.Close className="h-4 w-4" />}>
                Batalkan
              </Button>
            )}
            {nextAction && (
              <Button onClick={nextAction.action} icon={nextAction.icon}>
                {nextAction.label}
              </Button>
            )}
          </div>
        }
      />

      <WorkflowProgress status={order.status} />

      {order.status === "COMPLETED" && <Alert variant="success" title="Order Selesai" description="FG sudah diterima dan diposting." />}
      {order.status === "CANCELLED" && <Alert variant="error" title="Order Dibatalkan" description="Makloon order ini telah dibatalkan." />}

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-5">
            <div className="text-xs text-gray-500">Vendor</div>
            <div className="font-semibold">{order.vendor?.name || "-"}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="text-xs text-gray-500">Tanggal / Target</div>
            <div className="font-semibold">{formatDate(order.order_date)}</div>
            <div className="text-xs text-gray-500">{order.expected_completion_date ? formatDate(order.expected_completion_date) : "Tanpa target"}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="text-xs text-gray-500">Dokumen</div>
            <div className="font-semibold">{issues.length} Issue · {receipts.length} Receipt</div>
            <div className="text-xs text-gray-500">{issues.filter((i) => i.status === "POSTED").length + receipts.filter((r) => r.status === "POSTED").length} posted</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="text-xs text-gray-500">Estimasi Jasa</div>
            <div className="text-lg font-bold text-purple-600">{formatCurrency(order.total_jasa)}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Ringkasan Order</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <div className="text-gray-500">Status</div>
                <Badge className={STATUS_COLORS[order.status] || "bg-gray-100 text-gray-700"}>{order.status}</Badge>
              </div>
              <div>
                <div className="text-gray-500">Catatan</div>
                <div className="font-medium">{order.notes || "-"}</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Next Step</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {nextAction ? (
              <>
                <p className="text-sm text-gray-600">Lanjutkan proses dari workspace ini tanpa pindah halaman.</p>
                <Button className="w-full" onClick={nextAction.action} icon={nextAction.icon}>{nextAction.label}</Button>
              </>
            ) : (
              <p className="text-sm text-gray-600">Tidak ada action lanjutan untuk status ini.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Item FG yang Diproses ({items.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nama Item</TableHead>
                  <TableHead>Qty</TableHead>
                  <TableHead>Satuan</TableHead>
                  <TableHead className="text-right">Jasa/Unit</TableHead>
                  <TableHead className="text-right">Subtotal Jasa</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((it) => (
                  <TableRow key={it.id}>
                    <TableCell>{it.item_name}</TableCell>
                    <TableCell>{it.qty_ordered}</TableCell>
                    <TableCell>{it.uom_snapshot}</TableCell>
                    <TableCell className="text-right">{formatCurrency(it.jasa_per_unit)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(it.subtotal_jasa)}</TableCell>
                  </TableRow>
                ))}
                {items.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-gray-500">Tidak ada item</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader className="flex items-center justify-between">
            <CardTitle>Pengiriman Bahan ke Vendor</CardTitle>
            <Button size="sm" variant="outline" onClick={() => setIssueFormOpen(true)} icon={<Icons.Package className="h-4 w-4" />}>
              Buat Issue
            </Button>
          </CardHeader>
          <CardContent>
            {issues.length === 0 ? (
              <div className="rounded-lg border border-dashed p-6 text-center text-sm text-gray-500">Belum ada pengiriman bahan.</div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>No Issue</TableHead>
                      <TableHead>Tanggal</TableHead>
                      <TableHead>Items</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {issues.map((iss) => (
                      <TableRow key={iss.id}>
                        <TableCell className="font-mono text-sm">{iss.issue_no || iss.id.substring(0, 8)}</TableCell>
                        <TableCell>{formatDate(iss.issue_date)}</TableCell>
                        <TableCell>{iss.item_count || 0} item · {iss.total_qty || 0}</TableCell>
                        <TableCell><Badge className={STATUS_COLORS[iss.status] || "bg-gray-100"}>{iss.status}</Badge></TableCell>
                        <TableCell className="text-right">
                          <Button size="sm" variant="ghost" onClick={() => openIssueDetail(iss)} icon={<Icons.Eye className="h-4 w-4" />}>Lihat</Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex items-center justify-between">
            <CardTitle>Penerimaan Finished Good</CardTitle>
            <Button size="sm" onClick={() => setReceiptFormOpen(true)} icon={<Icons.Check className="h-4 w-4" />}>
              Buat Receipt
            </Button>
          </CardHeader>
          <CardContent>
            {receipts.length === 0 ? (
              <div className="rounded-lg border border-dashed p-6 text-center text-sm text-gray-500">Belum ada penerimaan FG.</div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>No Receipt</TableHead>
                      <TableHead>Tanggal</TableHead>
                      <TableHead>Items</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Jasa</TableHead>
                      <TableHead className="text-right">Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {receipts.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-mono text-sm">{r.receipt_no || r.id.substring(0, 8)}</TableCell>
                        <TableCell>{formatDate(r.receipt_date)}</TableCell>
                        <TableCell>{r.item_count || 0} item · {r.total_qty || 0}</TableCell>
                        <TableCell><Badge className={STATUS_COLORS[r.status] || "bg-gray-100"}>{r.status}</Badge></TableCell>
                        <TableCell className="text-right">{formatCurrency(r.total_jasa)}</TableCell>
                        <TableCell className="text-right">
                          <Button size="sm" variant="ghost" onClick={() => openReceiptDetail(r)} icon={<Icons.Eye className="h-4 w-4" />}>Lihat</Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog isOpen={issueFormOpen} onClose={() => setIssueFormOpen(false)} contentClassName="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Kirim Bahan ke Vendor</DialogTitle>
        </DialogHeader>
        <DialogContent>
          <MakloonMaterialIssueForm orderId={id} embedded onSuccess={closeFormModal} onCancel={() => setIssueFormOpen(false)} />
        </DialogContent>
      </Dialog>

      <Dialog isOpen={receiptFormOpen} onClose={() => setReceiptFormOpen(false)} contentClassName="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Terima Finished Good</DialogTitle>
        </DialogHeader>
        <DialogContent>
          <MakloonReceiptForm orderId={id} embedded onSuccess={closeFormModal} onCancel={() => setReceiptFormOpen(false)} />
        </DialogContent>
      </Dialog>

      <Dialog isOpen={Boolean(activeIssue || activeReceipt)} onClose={closeDocumentModal} contentClassName="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {activeIssue ? `Material Issue ${activeIssue.issue_no || activeIssue.id.substring(0, 8)}` : `Receipt FG ${activeReceipt?.receipt_no || activeReceipt?.id.substring(0, 8)}`}
          </DialogTitle>
        </DialogHeader>
        <DialogContent>
          {documentLoading ? (
            <div className="p-8 text-center text-gray-500">Loading...</div>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-3 text-sm md:grid-cols-3">
                <div>
                  <div className="text-gray-500">Tanggal</div>
                  <div className="font-medium">{activeIssue ? formatDate(activeIssue.issue_date) : activeReceipt ? formatDate(activeReceipt.receipt_date) : "-"}</div>
                </div>
                <div>
                  <div className="text-gray-500">Status</div>
                  <Badge className={STATUS_COLORS[(activeIssue?.status || activeReceipt?.status || "")] || "bg-gray-100"}>{activeIssue?.status || activeReceipt?.status}</Badge>
                </div>
                {activeReceipt && (
                  <div>
                    <div className="text-gray-500">Total Jasa</div>
                    <div className="font-semibold">{formatCurrency(activeReceipt.total_jasa)}</div>
                  </div>
                )}
              </div>

              <div className="overflow-x-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item</TableHead>
                      <TableHead>Satuan</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      {activeReceipt && <TableHead className="text-right">Jasa/Unit</TableHead>}
                      {activeReceipt && <TableHead className="text-right">Subtotal Jasa</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {documentLines.map((line) => (
                      <TableRow key={line.id}>
                        <TableCell>{line.item_name}</TableCell>
                        <TableCell>{line.uom}</TableCell>
                        <TableCell className="text-right">{line.qty}</TableCell>
                        {activeReceipt && <TableCell className="text-right">{formatCurrency(line.jasa_per_unit || 0)}</TableCell>}
                        {activeReceipt && <TableCell className="text-right">{formatCurrency(line.subtotal_jasa || 0)}</TableCell>}
                      </TableRow>
                    ))}
                    {documentLines.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={activeReceipt ? 5 : 3} className="text-center text-gray-500">Tidak ada item</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}