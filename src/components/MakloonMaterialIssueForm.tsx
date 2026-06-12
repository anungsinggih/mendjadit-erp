import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";
import { Button } from "./ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/Card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/Table";
import { Input } from "./ui/Input";
import { Alert } from "./ui/Alert";
import { PageHeader } from "./ui/PageHeader";
import { Combobox } from "./ui/Combobox";
import { Icons } from "./ui/Icons";
import { ITEM_TYPES } from "../lib/constants";

type Line = {
  id?: string;
  item_id: string;
  item_name: string;
  uom_snapshot: string;
  qty: number;
};

type MakloonOrder = {
  id: string;
  vendor_id: string;
  vendors: { name: string } | null;
};

type SelectableItem = {
  id: string;
  name: string;
  uom: string | null;
  sku: string | null;
  type: string;
};

type OrderItemRow = {
  item_id: string;
  qty_ordered: number;
};

type BomRow = {
  finished_good_id: string;
  raw_material_id: string;
  qty_per_fg: number;
};

type MakloonMaterialIssueFormProps = {
  orderId?: string;
  embedded?: boolean;
  onSuccess?: () => void;
  onCancel?: () => void;
};

export default function MakloonMaterialIssueForm({ orderId: propOrderId, embedded = false, onSuccess, onCancel }: MakloonMaterialIssueFormProps = {}) {
  const { id: routeOrderId } = useParams();
  const navigate = useNavigate();
  const orderId = propOrderId || routeOrderId;

  const [order, setOrder] = useState<MakloonOrder | null>(null);
  const [allSubscribedItems, setAllSubscribedItems] = useState<SelectableItem[]>([]);
  const materialItems = allSubscribedItems.filter((item) => item.type === ITEM_TYPES.RAW_MATERIAL);
  const [items, setItems] = useState<Line[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issueDate, setIssueDate] = useState(new Date().toISOString().split("T")[0]);
  const [notes, setNotes] = useState("");
  const [bomWarning, setBomWarning] = useState<string | null>(null);

  useEffect(() => {
    if (!orderId) return;
    const fetch = async () => {
      const [oRes, allRes, orderItemsRes] = await Promise.all([
        supabase.from("makloon_orders").select("*, vendors(name)").eq("id", orderId).single(),
        supabase
          .from("items")
          .select("id, name, uom, sku, type")
          .eq("is_active", true)
          .eq("type", ITEM_TYPES.RAW_MATERIAL),
        supabase
          .from("makloon_order_items")
          .select("item_id, qty_ordered")
          .eq("makloon_order_id", orderId),
      ]);
      if (oRes.error) { setError("Order tidak ditemukan"); return; }
      setOrder(oRes.data as MakloonOrder);
      const materialData = (allRes.data as SelectableItem[]) || [];
      setAllSubscribedItems(materialData);

      const orderItems = (orderItemsRes.data as OrderItemRow[]) || [];
      const fgIds = [...new Set(orderItems.map((item) => item.item_id))];

      if (fgIds.length > 0) {
        const { data: bomRows, error: bomError } = await supabase
          .from("item_boms")
          .select("finished_good_id, raw_material_id, qty_per_fg")
          .in("finished_good_id", fgIds);

        if (bomError) {
          setBomWarning("BOM belum bisa dimuat. Pilih bahan manual.");
          return;
        }

        const bomData = (bomRows as BomRow[]) || [];
        if (bomData.length === 0) {
          setBomWarning("Belum ada BOM untuk item FG di order ini. Pilih bahan manual atau setup BOM di Master Data.");
          return;
        }

        const materialMap = new Map(materialData.map((item) => [item.id, item]));
        const grouped = new Map<string, Line>();

        orderItems.forEach((orderItem) => {
          const relatedBom = bomData.filter((bom) => bom.finished_good_id === orderItem.item_id);
          relatedBom.forEach((bom) => {
            const material = materialMap.get(bom.raw_material_id);
            if (!material) return;

            const qtyNeeded = Number(orderItem.qty_ordered) * Number(bom.qty_per_fg);
            const existing = grouped.get(bom.raw_material_id);

            if (existing) {
              existing.qty += qtyNeeded;
            } else {
              grouped.set(bom.raw_material_id, {
                item_id: material.id,
                item_name: material.name,
                uom_snapshot: material.uom || "PCS",
                qty: qtyNeeded,
              });
            }
          });
        });

        if (grouped.size > 0) {
          setItems(Array.from(grouped.values()));
        } else {
          setBomWarning("BOM ditemukan, tapi bahan baku aktif yang terkait tidak tersedia di master item.");
        }
      }
    };
    fetch();
  }, [orderId]);

  const handleAddItem = (itemId: string) => {
    if (!itemId) return;
    const item = materialItems.find(i => i.id === itemId);
    if (!item) return;
    if (items.find((i) => i.item_id === item.id)) return;
    setItems([...items, { item_id: item.id, item_name: item.name, uom_snapshot: item.uom || "PCS", qty: 1 }]);
  };

  const updateQty = (idx: number, val: string) => {
    const copy = [...items];
    copy[idx].qty = Number(val) || 0;
    setItems(copy);
  };

  const removeItem = (idx: number) => {
    const copy = [...items];
    copy.splice(idx, 1);
    setItems(copy);
  };

  const save = async (post = false) => {
    if (!orderId || items.length === 0) { setError("Tambahkan minimal 1 item"); return; }
    setSaving(true);
    const payload = {
      makloon_order_id: orderId,
      issue_date: issueDate,
      notes,
      lines: items,
      post,
    };
    const { error: rpcError } = await supabase.rpc("create_makloon_issue", payload);
    setSaving(false);
    if (rpcError) { setError(rpcError.message); return; }
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
          title="Kirim Bahan ke Vendor Konveksi"
          breadcrumbs={[{ label: "Makloon", href: "/makloon" }, { label: "Material Issue" }]}
          actions={
            <Button variant="outline" onClick={() => navigate(`/makloon/${orderId}`)} icon={<Icons.ArrowLeft className="w-4 h-4" />}>
              Batal
            </Button>
          }
        />
      )}
      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Tanggal Pengiriman</label>
              <Input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Vendor Konveksi</label>
              <div className="text-sm py-2">{order.vendors?.name}</div>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Catatan</label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Opsional" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pilih Bahan yang Dikirim</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Combobox
            options={materialItems.map(i => ({
              value: i.id,
              label: `${i.name} (${i.sku || "-"})`,
              keywords: [i.sku || "", i.name]
            }))}
            onChange={handleAddItem}
            placeholder="Cari item bahan..."
          />
          {materialItems.length === 0 && (
            <Alert
              title="Belum ada item bahan aktif"
              description="Master item untuk Material Issue hanya menampilkan item dengan tipe RAW_MATERIAL."
            />
          )}
          {bomWarning && (
            <Alert
              title="Auto-populate BOM belum penuh"
              description={bomWarning}
            />
          )}
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead className="w-24">Satuan</TableHead>
                  <TableHead className="w-40">Qty</TableHead>
                  <TableHead className="w-16 text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((it, idx) => (
                  <TableRow key={it.item_id}>
                    <TableCell>{it.item_name}</TableCell>
                    <TableCell className="whitespace-nowrap">{it.uom_snapshot}</TableCell>
                    <TableCell>
                      <Input type="number" value={it.qty} onChange={(e) => updateQty(idx, e.target.value)} min={0.01} step="any" className="w-full min-w-[100px]" />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => removeItem(idx)} icon={<Icons.Trash className="h-4 w-4" />} />
                    </TableCell>
                  </TableRow>
                ))}
                {items.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-gray-500">Belum ada item</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap justify-end gap-2">
        {embedded && <Button variant="outline" onClick={onCancel} disabled={saving}>Batal</Button>}
        <Button onClick={() => save(false)} isLoading={saving} disabled={saving} icon={<Icons.Save className="w-4 h-4" />}>Simpan Draft</Button>
        <Button variant="outline" onClick={() => save(true)} isLoading={saving} disabled={saving} icon={<Icons.Check className="w-4 h-4" />}>Simpan & Post (Kurangi Stok)</Button>
      </div>
    </div>
  );
}