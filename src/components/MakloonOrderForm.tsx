import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../supabaseClient";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "./ui/Button";
import { Input } from "./ui/Input";
import { Textarea } from "./ui/Textarea";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "./ui/Card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/Table";
import { Icons } from "./ui/Icons";
import { Combobox } from "./ui/Combobox";
import { TotalFooter } from "./ui/TotalFooter";
import { useConfirm } from "./ui/ConfirmDialogContext";
import { useQueryClient } from "../hooks/useQueries";
import { PageHeader } from "./ui/PageHeader";

type Vendor = { id: string; name: string; vendor_type: string };
type Item = { id: string; name: string; sku: string; uom: string; type: string };

type OrderLine = {
  item_id: string;
  item_name: string;
  sku: string;
  uom: string;
  qty_ordered: number;
  jasa_per_unit: number;
  subtotal_jasa: number;
};

type MakloonOrderItemRow = {
  item_id: string;
  uom_snapshot: string;
  qty_ordered: number;
  jasa_per_unit: number;
  subtotal_jasa: number;
};

export default function MakloonOrderForm() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { confirm } = useConfirm();
  const queryClient = useQueryClient();

  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(false);

  const [vendorId, setVendorId] = useState("");
  const [orderDate, setOrderDate] = useState(new Date().toISOString().split("T")[0]);
  const [expectedDate, setExpectedDate] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<OrderLine[]>([]);

  const [selectedItemId, setSelectedItemId] = useState("");
  const [qty, setQty] = useState(1);
  const [jasaPerUnit, setJasaPerUnit] = useState<number | null>(null);
  const [defaultCost, setDefaultCost] = useState<number | null>(null);
  const [costNotFound, setCostNotFound] = useState(false);
  const isEditMode = Boolean(id);

  // Add this function to generate order number preview
  const generateOrderNoPreview = () => {
    const datePart = orderDate.replace(/-/g, '');
    const vendorPart = vendorId.substring(0, 4).toUpperCase();
    return `MKL-${datePart}-${vendorPart}`;
  };

  // Add this function to fetch default cost for selected vendor and item
  const fetchDefaultCost = async (vendorId: string, itemId: string) => {
    console.log("Fetching cost for:", { vendorId, itemId });
    if (!vendorId || !itemId) return null;

    const { data: preferredData, error: prefErr } = await supabase
      .from('vendor_items')
      .select('unit_cost')
      .eq('vendor_id', vendorId)
      .eq('item_id', itemId)
      .eq('is_active', true)
      .eq('is_preferred', true)
      .maybeSingle();
      
    console.log("Preferred data result:", { data: preferredData, error: prefErr });

    if (preferredData?.unit_cost !== undefined && preferredData?.unit_cost !== null) {
      setCostNotFound(false);
      return preferredData.unit_cost;
    }

    const { data: fallbackData, error: fallErr } = await supabase
      .from('vendor_items')
      .select('unit_cost')
      .eq('vendor_id', vendorId)
      .eq('item_id', itemId)
      .eq('is_active', true)
      .maybeSingle();
      
    console.log("Fallback data result:", { data: fallbackData, error: fallErr });

    if (fallbackData?.unit_cost !== undefined && fallbackData?.unit_cost !== null) {
      setCostNotFound(false);
      return fallbackData.unit_cost;
    }

    setCostNotFound(true);
    return null;
  };

  useEffect(() => {
    const hydrateJasa = async () => {
      if (!vendorId || !selectedItemId) {
        setDefaultCost(null);
        setCostNotFound(false);
        return;
      }

      const cost = await fetchDefaultCost(vendorId, selectedItemId);
      setDefaultCost(cost);
      if (cost !== null) {
        setJasaPerUnit(cost);
      }
    };

    hydrateJasa();
  }, [vendorId, selectedItemId]);

  useEffect(() => {
    const fetchMasterData = async () => {
      const [venRes, itemRes] = await Promise.all([
        supabase
          .from("vendors")
          .select("id, name, vendor_type")
          .in("vendor_type", ["KONVEKSI", "INTERNAL"])
          .eq("is_active", true)
          .order("name"),
        supabase
          .from("items")
          .select("id, name, sku, uom, type")
          .eq("is_active", true)
          .in("type", ["FINISHED_GOOD"])
          .order("sku"),
      ]);
      setVendors((venRes.data as Vendor[]) || []);
      setItems((itemRes.data as Item[]) || []);
    };
    fetchMasterData();
  }, []);

  useEffect(() => {
    if (!id) return;

    const fetchDraftOrder = async () => {
      setLoading(true);
      try {
        const [orderRes, itemRes] = await Promise.all([
          supabase
            .from("makloon_orders")
            .select("id, vendor_id, order_date, expected_completion_date, notes, status")
            .eq("id", id)
            .single(),
          supabase
            .from("makloon_order_items")
            .select("item_id, uom_snapshot, qty_ordered, jasa_per_unit, subtotal_jasa")
            .eq("makloon_order_id", id),
        ]);

        if (orderRes.error) throw orderRes.error;
        if (itemRes.error) throw itemRes.error;
        if (orderRes.data.status !== "DRAFT") {
          throw new Error("Hanya draft order yang bisa diedit.");
        }

        const orderData = orderRes.data;
        const orderItems = (itemRes.data as MakloonOrderItemRow[]) || [];
        const itemIds = [...new Set(orderItems.map(item => item.item_id))];
        const itemMap = new Map<string, Item>();

        if (itemIds.length > 0) {
          const { data: itemRows, error: itemErr } = await supabase
            .from("items")
            .select("id, name, sku, uom, type")
            .in("id", itemIds);

          if (itemErr) throw itemErr;
          ((itemRows as Item[]) || []).forEach(item => itemMap.set(item.id, item));
        }

        setVendorId(orderData.vendor_id || "");
        setOrderDate(orderData.order_date || new Date().toISOString().split("T")[0]);
        setExpectedDate(orderData.expected_completion_date || "");
        setNotes(orderData.notes || "");
        setLines(orderItems.map(item => {
          const masterItem = itemMap.get(item.item_id);
          return {
            item_id: item.item_id,
            item_name: masterItem?.name || "-",
            sku: masterItem?.sku || "-",
            uom: item.uom_snapshot || masterItem?.uom || "",
            qty_ordered: item.qty_ordered,
            jasa_per_unit: item.jasa_per_unit,
            subtotal_jasa: item.subtotal_jasa,
          };
        }));
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        await confirm({ title: "Error", description: msg, confirmText: "OK", hideCancel: true });
        navigate("/makloon/orders", { replace: true });
      } finally {
        setLoading(false);
      }
    };

    fetchDraftOrder();
  }, [id, confirm, navigate]);

  function addLine() {
    if (!selectedItemId || !qty || jasaPerUnit === null) return;
    const item = items.find(i => i.id === selectedItemId);
    if (!item) return;
    const safeQty = Math.max(1, qty);
    const safeJasa = Math.max(0, jasaPerUnit);
    setLines(prev => {
      const existing = prev.findIndex(l => l.item_id === selectedItemId);
      if (existing >= 0) {
        const next = [...prev];
        const merged = next[existing].qty_ordered + safeQty;
        next[existing] = { ...next[existing], qty_ordered: merged, subtotal_jasa: merged * next[existing].jasa_per_unit };
        return next;
      }
      return [...prev, {
        item_id: item.id,
        item_name: item.name,
        sku: item.sku,
        uom: item.uom,
        qty_ordered: safeQty,
        jasa_per_unit: safeJasa,
        subtotal_jasa: safeQty * safeJasa,
      }];
    });
    setSelectedItemId("");
    setQty(1);
    setJasaPerUnit(null);
  }

  const totalJasa = useMemo(() => lines.reduce((s, l) => s + l.subtotal_jasa, 0), [lines]);

  const handleSave = useCallback(async () => {
    if (!vendorId) { await confirm({ title: "Validasi", description: "Pilih vendor konveksi.", confirmText: "OK", hideCancel: true }); return; }
    if (lines.length === 0) { await confirm({ title: "Validasi", description: "Tambahkan item FG yang akan diproduksi.", confirmText: "OK", hideCancel: true }); return; }

    setLoading(true);
    try {
      const payload = {
        vendor_id: vendorId,
        order_date: orderDate,
        expected_completion_date: expectedDate || null,
        notes: notes || null,
        total_jasa: totalJasa,
        status: "DRAFT",
      };

      const orderId = id;

      if (isEditMode && orderId) {
        const { error: orderError } = await supabase
          .from("makloon_orders")
          .update(payload)
          .eq("id", orderId)
          .eq("status", "DRAFT");
        if (orderError) throw orderError;

        const { error: deleteError } = await supabase
          .from("makloon_order_items")
          .delete()
          .eq("makloon_order_id", orderId);
        if (deleteError) throw deleteError;

        const itemData = lines.map(l => ({
          makloon_order_id: orderId,
          item_id: l.item_id,
          uom_snapshot: l.uom,
          qty_ordered: l.qty_ordered,
          jasa_per_unit: l.jasa_per_unit,
          subtotal_jasa: l.subtotal_jasa,
        }));
        const { error: itemError } = await supabase.from("makloon_order_items").insert(itemData);
        if (itemError) throw itemError;

        queryClient.invalidateQueries({ queryKey: ["makloon-orders"] });
        navigate(`/makloon/${orderId}`, { replace: true });
        return;
      }

      const { data: orderData, error: orderError } = await supabase
        .from("makloon_orders")
        .insert([payload])
        .select()
        .single();
      if (orderError) throw orderError;

      const itemData = lines.map(l => ({
        makloon_order_id: orderData.id,
        item_id: l.item_id,
        uom_snapshot: l.uom,
        qty_ordered: l.qty_ordered,
        jasa_per_unit: l.jasa_per_unit,
        subtotal_jasa: l.subtotal_jasa,
      }));
      const { error: itemError } = await supabase.from("makloon_order_items").insert(itemData);
      if (itemError) throw itemError;

      queryClient.invalidateQueries({ queryKey: ["makloon-orders"] });
      navigate(`/makloon/${orderData.id}`, { replace: true });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      await confirm({ title: "Error", description: msg, confirmText: "OK", hideCancel: true });
    } finally {
      setLoading(false);
    }
  }, [vendorId, orderDate, expectedDate, notes, lines, totalJasa, id, isEditMode, confirm, navigate, queryClient]);

  return (
    <div className="w-full space-y-6 pb-20">
      <PageHeader
        title={isEditMode ? "Edit Draft Order Makloon" : "Buat Order Makloon Baru"}
        breadcrumbs={[{ label: "Makloon", href: "/makloon" }, { label: isEditMode ? "Edit Order" : "New Order" }]}
      />
      <Card className="shadow-md">
        <CardHeader className="border-b bg-slate-50/50">
          <CardTitle>Work Order Makloon</CardTitle>
          <p className="text-sm text-gray-500">Definisikan kontrak produksi finished good dengan vendor konveksi.</p>
        </CardHeader>
      <CardContent className="pt-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: header */}
          <div className="space-y-4">
            <Combobox
              label="Vendor Konveksi"
              value={vendorId}
              onChange={setVendorId}
              placeholder="-- Pilih Vendor Konveksi --"
              options={vendors.map(v => ({
                label: v.name,
                value: v.id,
                content: (
                  <div className="flex flex-col">
                    <span className="font-medium">{v.name}</span>
                    <span className="text-xs text-slate-500">{v.vendor_type}</span>
                  </div>
                )
              }))}
            />
            <div className="space-y-1">
              <Input label="Tanggal Order" type="date" value={orderDate} onChange={e => setOrderDate(e.target.value)} />
              {vendorId && (
                <div className="text-xs text-gray-500 mt-1">
                  No. Order Preview: <span className="font-mono text-sm">{generateOrderNoPreview()}</span>
                </div>
              )}
            </div>
            <Input label="Target Selesai (opsional)" type="date" value={expectedDate} onChange={e => setExpectedDate(e.target.value)} />
            <Textarea label="Catatan" placeholder="Instruksi produksi, referensi, dll..." value={notes} onChange={e => setNotes(e.target.value)} />
          </div>

          {/* Right: items */}
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-blue-50/50 p-4 rounded-lg border border-blue-100">
              <h4 className="font-semibold text-sm text-blue-900 uppercase tracking-wide mb-3">Tambah FG yang Diproduksi</h4>
              <div className="flex flex-wrap gap-3 items-end">
                <div className="flex-grow min-w-[200px]">
                  <Combobox
                    label="Item FG"
                    value={selectedItemId}
                    onChange={async (val) => {
                      setSelectedItemId(val);
                      setJasaPerUnit(null);
                      if (vendorId && val) {
                        const cost = await fetchDefaultCost(vendorId, val);
                        setDefaultCost(cost);
                        if (cost !== null) {
                          setJasaPerUnit(cost);
                        }
                      }
                    }}
                    placeholder="Pilih FG..."
                    options={items.map(i => ({
                      label: `${i.sku} - ${i.name}`,
                      value: i.id,
                      keywords: [i.sku, i.name],
                    }))}
                    className="!mb-0"
                  />
                  {defaultCost !== null && (
                    <div className="text-xs text-gray-500 mt-1">
                      Default Cost: Rp {defaultCost.toLocaleString()}
                    </div>
                  )}
                  {costNotFound && (
                    <div className="text-xs text-yellow-600 mt-1">
                      Cost belum diatur untuk vendor ini
                    </div>
                  )}
                </div>
                <div className="w-24">
                  <Input label="Qty" type="number" min={1} value={qty} onFocus={e => e.target.select()} onChange={e => setQty(Math.max(1, parseInt(e.target.value) || 1))} containerClassName="!mb-0" />
                </div>
                <div className="w-36">
                  <Input
                    label="Jasa/Unit (Rp)"
                    type="number" min={0}
                    value={jasaPerUnit === null ? "" : jasaPerUnit}
                    placeholder="0"
                    onFocus={e => e.target.select()}
                    onChange={e => setJasaPerUnit(Math.max(0, parseFloat(e.target.value) || 0))}
                    onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addLine(); } }}
                    containerClassName="!mb-0"
                  />
                  {defaultCost !== null && jasaPerUnit === defaultCost && (
                    <div className="text-xs text-green-600 mt-1">
                      Auto-filled dari master cost
                    </div>
                  )}
                  {defaultCost !== null && jasaPerUnit !== null && jasaPerUnit !== defaultCost && (
                    <div className="text-xs text-red-500 mt-1">
                      Cost berbeda dari default
                    </div>
                  )}
                </div>
                <Button onClick={addLine} disabled={!selectedItemId}>Tambah</Button>
              </div>
            </div>

            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader className="bg-gray-50">
                  <TableRow>
                    <TableHead>SKU</TableHead>
                    <TableHead>Item FG</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Jasa/Unit</TableHead>
                    <TableHead className="text-right">Subtotal Jasa</TableHead>
                    <TableHead className="w-10">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-gray-400 py-8 italic">Belum ada item</TableCell>
                    </TableRow>
                  ) : lines.map((l, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-mono text-sm">{l.sku}</TableCell>
                      <TableCell>{l.item_name}</TableCell>
                      <TableCell className="text-right">{l.qty_ordered} {l.uom}</TableCell>
                      <TableCell className="text-right">{l.jasa_per_unit.toLocaleString()}</TableCell>
                      <TableCell className="text-right font-medium">{l.subtotal_jasa.toLocaleString()}</TableCell>
                      <TableCell>
                        <button onClick={() => setLines(prev => prev.filter((_, idx) => idx !== i))} className="text-gray-400 hover:text-red-500">
                          <Icons.Trash className="w-4 h-4" />
                        </button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <TotalFooter label="Total Estimasi Jasa" amount={totalJasa} />
            </div>
          </div>
        </div>
        </CardContent>
        <CardFooter className="border-t bg-gray-50 p-4 gap-3">
          <Button variant="outline" onClick={() => navigate("/makloon")} icon={<Icons.ArrowLeft className="w-4 h-4" />}>Batal</Button>
          <Button onClick={handleSave} isLoading={loading} disabled={loading} icon={<Icons.Save className="w-4 h-4" />}>{isEditMode ? "Update Draft Order" : "Simpan Draft Order"}</Button>
        </CardFooter>
      </Card>
    </div>
  );
}