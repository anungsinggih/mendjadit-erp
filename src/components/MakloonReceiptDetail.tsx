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
import { formatCurrency, formatDate } from "../lib/format";
import { useConfirm } from "./ui/ConfirmDialogContext";

type Receipt = {
  id: string;
  receipt_no: string | null;
  receipt_date: string;
  status: string;
  notes: string | null;
  total_jasa: number;
  makloon_order_id: string;
  makloon_orders: {
    order_no: string | null;
  } | null;
  vendors: {
    name: string;
  } | null;
};

type ReceiptItem = {
  id: string;
  item_name: string;
  uom_snapshot: string;
  qty_received: number;
  jasa_per_unit: number;
  material_cost_per_unit: number;
  subtotal_jasa: number;
};

type ReceiptItemRow = {
  id: string;
  item_id: string;
  uom_snapshot: string;
  qty_received: number;
  jasa_per_unit: number;
  material_cost_per_unit: number;
  subtotal_jasa: number;
};

type ItemNameRow = {
  id: string;
  name: string;
};

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-700",
  POSTED: "bg-green-100 text-green-700",
};

type MakloonReceiptDetailProps = {
  receiptId?: string;
  embedded?: boolean;
  onClose?: () => void;
};

export default function MakloonReceiptDetail({ receiptId, embedded = false, onClose }: MakloonReceiptDetailProps = {}) {
  const { id: routeId } = useParams();
  const id = receiptId || routeId;
  const navigate = useNavigate();
  const { confirm } = useConfirm();

  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [items, setItems] = useState<ReceiptItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const showError = useCallback(
    async (message: string) => {
      await confirm({ title: "Error", description: message, confirmText: "OK", hideCancel: true });
    },
    [confirm],
  );

  const fetchReceipt = useCallback(async () => {
    if (!id) return;

    setLoading(true);
    setError(null);

    const [rRes, itemsRes] = await Promise.all([
      supabase
        .from("makloon_receipts")
        .select("*, makloon_orders(order_no), vendors(name)")
        .eq("id", id)
        .single(),
      supabase
        .from("makloon_receipt_items")
        .select("id, item_id, uom_snapshot, qty_received, jasa_per_unit, material_cost_per_unit, subtotal_jasa")
        .eq("receipt_id", id),
    ]);
    if (rRes.error) {
      setError("Receipt tidak ditemukan");
      setLoading(false);
      return;
    }

    const receiptItems = (itemsRes.data as ReceiptItemRow[]) || [];
    const itemIds = [...new Set(receiptItems.map((item) => item.item_id))];
    const itemNameMap = new Map<string, string>();

    if (itemIds.length > 0) {
      const { data: itemRows } = await supabase
        .from("items")
        .select("id, name")
        .in("id", itemIds);

      ((itemRows as ItemNameRow[]) || []).forEach((item) => {
        itemNameMap.set(item.id, item.name);
      });
    }

    setReceipt(rRes.data as unknown as Receipt);
    setItems(
      receiptItems.map((item) => ({
        id: item.id,
        item_name: itemNameMap.get(item.item_id) || "-",
        uom_snapshot: item.uom_snapshot,
        qty_received: item.qty_received,
        jasa_per_unit: item.jasa_per_unit,
        material_cost_per_unit: item.material_cost_per_unit,
        subtotal_jasa: item.subtotal_jasa,
      })),
    );
    setLoading(false);
  }, [id]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchReceipt();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [fetchReceipt]);

  const handleDelete = async () => {
    const confirmed = await confirm({
      title: "Hapus Receipt?",
      description: "Draft receipt ini akan dihapus secara permanen.",
      confirmText: "Ya, Hapus",
      cancelText: "Batal",
    });
    if (confirmed) {
      const { error } = await supabase.rpc("rpc_delete_makloon_receipt_draft", { p_receipt_id: id });
      if (error) {
        await showError(error.message);
      } else {
        if (embedded) onClose?.();
        else navigate(`/makloon/${receipt?.makloon_order_id}`);
      }
    }
  };

  const handlePost = async () => {
    const confirmed = await confirm({
      title: "Post Receipt?",
      description: "Stok FG akan bertambah dan hutang akan dicatat. Aksi ini tidak dapat dibatalkan.",
      confirmText: "Ya, Post",
      cancelText: "Batal",
    });
    if (confirmed) {
      const { error } = await supabase.rpc("rpc_post_makloon_receipt", { p_receipt_id: id });
      if (error) {
        await showError(error.message);
      } else {
        await fetchReceipt();
      }
    }
  };

  if (loading) return <div className="p-8 text-center text-gray-500">Loading...</div>;
  if (error) return <Alert variant="error" title="Error" description={error} />;
  if (!receipt) return null;

  return (
    <div className="w-full space-y-6 pb-20">
      {!embedded ? (
        <PageHeader
          title={`Receipt FG ${receipt.receipt_no || receipt.id.substring(0, 8)}`}
          breadcrumbs={[
            { label: "Makloon", href: "/makloon" },
            { label: `Order ${receipt.makloon_orders?.order_no || "Detail"}`, href: `/makloon/${receipt.makloon_order_id}` },
            { label: "Receipt" }
          ]}
          actions={
            <div className="flex gap-2">
              {receipt.status === "DRAFT" && (
                <>
                  <Button variant="outline" className="text-red-600 hover:bg-red-50" onClick={handleDelete} icon={<Icons.Trash className="w-4 h-4" />}>
                    Hapus
                  </Button>
                  <Button onClick={handlePost} icon={<Icons.Check className="w-4 h-4" />}>
                    Post Receipt
                  </Button>
                </>
              )}
              <Button variant="outline" onClick={() => navigate(`/makloon/${receipt.makloon_order_id}`)} icon={<Icons.ArrowLeft className="w-4 h-4" />}>
                Kembali
              </Button>
            </div>
          }
        />
      ) : (
        <div className="flex justify-end gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
            {receipt.status === "DRAFT" && (
              <>
                <Button variant="outline" className="text-red-600 hover:bg-red-50" onClick={handleDelete} icon={<Icons.Trash className="w-4 h-4" />}>
                  Hapus
                </Button>
                <Button onClick={handlePost} icon={<Icons.Check className="w-4 h-4" />}>
                  Post Receipt
                </Button>
              </>
            )}
            <Button variant="outline" onClick={() => onClose?.()} icon={<Icons.ArrowLeft className="w-4 h-4" />}>
              Close
            </Button>
          </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Detail Receipt</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div className="space-y-2">
              <div>
                <span className="text-gray-500">No Receipt</span>
                <div className="font-medium font-mono">{receipt.receipt_no || "-"}</div>
              </div>
              <div>
                <span className="text-gray-500">Tanggal Penerimaan</span>
                <div className="font-medium">{formatDate(receipt.receipt_date)}</div>
              </div>
              <div>
                <span className="text-gray-500">Status</span>
                <div>
                  <Badge className={STATUS_COLORS[receipt.status] || "bg-gray-100"}>{receipt.status}</Badge>
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <div>
                <span className="text-gray-500">Vendor Konveksi</span>
                <div className="font-medium">{receipt.vendors?.name || "-"}</div>
              </div>
              <div>
                <span className="text-gray-500">Terkait Makloon Order</span>
                <div className="font-medium font-mono">{receipt.makloon_orders?.order_no || receipt.makloon_order_id.substring(0, 8)}</div>
              </div>
              <div>
                <span className="text-gray-500">Total Biaya Jasa</span>
                <div className="font-medium text-lg text-blue-600">{formatCurrency(receipt.total_jasa)}</div>
              </div>
            </div>
          </div>
          {receipt.notes && (
            <div className="pt-4 border-t">
              <span className="text-gray-500 text-sm">Catatan</span>
              <div className="font-medium">{receipt.notes}</div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Item yang Diterima ({items.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nama Item</TableHead>
                  <TableHead>Satuan</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Jasa/Unit</TableHead>
                  <TableHead className="text-right">Bahan/Unit</TableHead>
                  <TableHead className="text-right">Subtotal Jasa</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((it) => (
                  <TableRow key={it.id}>
                    <TableCell>{it.item_name}</TableCell>
                    <TableCell>{it.uom_snapshot}</TableCell>
                    <TableCell className="text-right">{it.qty_received}</TableCell>
                    <TableCell className="text-right">{formatCurrency(it.jasa_per_unit)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(it.material_cost_per_unit)}</TableCell>
                    <TableCell className="text-right font-medium">{formatCurrency(it.subtotal_jasa)}</TableCell>
                  </TableRow>
                ))}
                {items.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-gray-500">Tidak ada item</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
