import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";
import { Button } from "./ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/Card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/Table";
import { Input } from "./ui/Input";
import { Alert } from "./ui/Alert";
import { PageHeader } from "./ui/PageHeader";
import { formatCurrency } from "../lib/format";
import { Combobox } from "./ui/Combobox";
import { Icons } from "./ui/Icons";

type Line = {
  id?: string;
  item_id: string;
  item_name: string;
  uom_snapshot: string;
  qty_received: number;
  jasa_per_unit: number;
  subtotal: number;
  original_jasa?: number;
  jasaChanged?: boolean;
};

type MakloonOrder = {
  id: string;
  vendor_id: string;
  vendors: { name: string } | null;
};

type MakloonOrderItemRow = {
  item_id: string;
  uom_snapshot: string;
  qty_ordered: number;
  jasa_per_unit: number;
};

type SelectableItem = {
  id: string;
  name: string;
  uom: string | null;
  sku: string | null;
};

type MakloonReceiptFormProps = {
  orderId?: string;
  embedded?: boolean;
  onSuccess?: () => void;
  onCancel?: () => void;
};

export default function MakloonReceiptForm({ orderId: propOrderId, embedded = false, onSuccess, onCancel }: MakloonReceiptFormProps = {}) {
  const { id: routeOrderId } = useParams();
  const navigate = useNavigate();
  const orderId = propOrderId || routeOrderId;

  const [order, setOrder] = useState<MakloonOrder | null>(null);
  const [allSubscribedItems, setAllSubscribedItems] = useState<SelectableItem[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receiptDate, setReceiptDate] = useState(new Date().toISOString().split("T")[0]);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!orderId) return;
    const fetch = async () => {
      const [oRes, iRes] = await Promise.all([
        supabase.from("makloon_orders").select("*, vendors(name)").eq("id", orderId).single(),
        supabase
          .from("makloon_order_items")
          .select("item_id, uom_snapshot, qty_ordered, jasa_per_unit")
          .eq("makloon_order_id", orderId),
      ]);
      if (oRes.error) {
        setError("Order tidak ditemukan");
        return;
      }
      const orderData = oRes.data as MakloonOrder;
      setOrder(orderData);

      const orderItems = (iRes.data as MakloonOrderItemRow[]) || [];
      const itemIds = [...new Set(orderItems.map((item) => item.item_id))];
      const itemNameMap = new Map<string, string>();

      if (itemIds.length > 0) {
        const { data: itemRows } = await supabase
          .from("items")
          .select("id, name, uom, sku")
          .in("id", itemIds);

        const selectableRows = (itemRows as SelectableItem[]) || [];
        selectableRows.forEach((item) => {
          itemNameMap.set(item.id, item.name);
        });
        setAllSubscribedItems(selectableRows);
      } else {
        setAllSubscribedItems([]);
      }

      if (orderItems.length > 0) {
        const preparedLines = orderItems.map(
          (oi): Line => ({
            item_id: oi.item_id,
            item_name: itemNameMap.get(oi.item_id) || "-",
            uom_snapshot: oi.uom_snapshot,
            qty_received: oi.qty_ordered,
            jasa_per_unit: oi.jasa_per_unit,
            subtotal: oi.qty_ordered * oi.jasa_per_unit,
            original_jasa: oi.jasa_per_unit,
          }),
        );

        setLines(preparedLines);
      }
    };
    fetch();
  }, [orderId]);

  const handleAddItem = (itemId: string) => {
    if (!itemId) return;
    const item = allSubscribedItems.find((i) => i.id === itemId);
    if (!item) return;
    if (lines.find((l) => l.item_id === item.id)) return;
    setLines([
      ...lines,
      {
        item_id: item.id,
        item_name: item.name,
        uom_snapshot: item.uom || "PCS",
        qty_received: 1,
        jasa_per_unit: 0,
        subtotal: 0,
      },
    ]);
  };

  const updateLine = (idx: number, field: "qty_received" | "jasa_per_unit", val: string) => {
    const copy = [...lines];
    const numVal = Number(val) || 0;
    copy[idx] = { ...copy[idx], [field]: numVal };

    if (field === "qty_received" || field === "jasa_per_unit") {
      copy[idx].subtotal = copy[idx].qty_received * copy[idx].jasa_per_unit;
    }

    if (field === "jasa_per_unit") {
      copy[idx].jasaChanged = numVal !== copy[idx].original_jasa;
    }

    setLines(copy);
  };

  const removeLine = (idx: number) => {
    const copy = [...lines];
    copy.splice(idx, 1);
    setLines(copy);
  };

  const totalJasa = lines.reduce((sum, l) => sum + l.subtotal, 0);

  const save = async (post = false) => {
    if (!orderId || lines.length === 0) {
      setError("Tambahkan minimal 1 item");
      return;
    }
    setSaving(true);
    const payload = {
      p_makloon_order_id: orderId,
      p_receipt_date: receiptDate,
      p_notes: notes || null,
      p_lines: lines.map((l) => ({
        item_id: l.item_id,
        item_name: l.item_name,
        uom_snapshot: l.uom_snapshot,
        qty_received: l.qty_received,
        jasa_per_unit: l.jasa_per_unit,
      })),
      p_post: post,
    };
    const { error: rpcError } = await supabase.rpc("rpc_create_makloon_receipt", payload);
    setSaving(false);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    if (embedded) {
      onSuccess?.();
    } else {
      navigate(`/makloon/${orderId}`);
    }
  };

  if (error) return <Alert variant="error" title="Error" description={error} />;
  if (!order) return <div className="p-8 text-center text-gray-500">Loading...</div>;

  return (
    <div className={`w-full space-y-6 ${embedded ? "" : "pb-20"}`}>
      {!embedded && (
        <PageHeader
          title="Terima Finished Good dari Vendor"
          breadcrumbs={[{ label: "Makloon", href: "/makloon" }, { label: "Receipt FG" }]}
          actions={
            <Button
              variant="outline"
              onClick={() => navigate(`/makloon/${orderId}`)}
              icon={<Icons.ArrowLeft className="w-4 h-4" />}
            >
              Batal
            </Button>
          }
        />
      )}

      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium">Tanggal Penerimaan</label>
              <Input type="date" value={receiptDate} onChange={(e) => setReceiptDate(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Vendor Konveksi</label>
              <div className="py-2 text-sm">{order.vendors?.name}</div>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Catatan</label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Opsional" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pilih Item yang Diterima</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert
            title="Material cost otomatis"
            description="HPP bahan tidak diinput di receipt. Nilai bahan akan diambil otomatis dari posted Material Issue untuk order ini saat receipt dipost."
          />
          <Combobox
            options={allSubscribedItems.map((i) => ({
              value: i.id,
              label: `${i.name} (${i.sku || "-"})`,
              keywords: [i.sku || "", i.name],
            }))}
            onChange={handleAddItem}
            placeholder="Cari finished good..."
          />
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead className="w-24">Satuan</TableHead>
                  <TableHead className="w-32 text-right">Qty Diterima</TableHead>
                  <TableHead className="w-40 text-right">Jasa/Unit</TableHead>
                  <TableHead className="w-40 text-right">Subtotal Jasa</TableHead>
                  <TableHead className="w-16 text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((l, idx) => (
                  <TableRow key={l.item_id}>
                    <TableCell>{l.item_name}</TableCell>
                    <TableCell className="whitespace-nowrap">{l.uom_snapshot}</TableCell>
                    <TableCell className="text-right">
                      <Input
                        type="number"
                        value={l.qty_received}
                        onChange={(e) => updateLine(idx, "qty_received", e.target.value)}
                        min={0.01}
                        step="any"
                        className="ml-auto w-full min-w-[80px]"
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Input
                        type="number"
                        value={l.jasa_per_unit}
                        onChange={(e) => updateLine(idx, "jasa_per_unit", e.target.value)}
                        min={0}
                        step="any"
                        className={`ml-auto w-full min-w-[100px] ${l.jasaChanged ? "border-red-500" : ""}`}
                      />
                      {l.jasaChanged && (
                        <div className="mt-1 text-xs text-red-500">Jasa berbeda dari nilai asli</div>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-medium">{formatCurrency(l.subtotal)}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => removeLine(idx)} icon={<Icons.Trash className="h-4 w-4" />} />
                    </TableCell>
                  </TableRow>
                ))}
                {lines.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-gray-500">
                      Belum ada item
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          <div className="flex justify-end border-t pt-4">
            <div className="text-right">
              <div className="text-sm text-gray-500">Total Biaya Jasa</div>
              <div className="text-xl font-bold">{formatCurrency(totalJasa)}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap justify-end gap-2">
        {embedded && <Button variant="outline" onClick={onCancel} disabled={saving}>Batal</Button>}
        <Button
          onClick={() => save(false)}
          isLoading={saving}
          disabled={saving}
          icon={<Icons.Save className="w-4 h-4" />}
        >
          Simpan Draft
        </Button>
        <Button
          variant="outline"
          onClick={() => save(true)}
          isLoading={saving}
          disabled={saving}
          icon={<Icons.Check className="w-4 h-4" />}
        >
          Simpan & Post (Tambah Stok & Hutang)
        </Button>
      </div>
    </div>
  );
}
