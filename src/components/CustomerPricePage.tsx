import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../supabaseClient";
import { Button } from "./ui/Button";
import { Input } from "./ui/Input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/Table";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/Card";
import { Icons } from "./ui/Icons";
import { CustomerBadge } from "./ui/CustomerBadge";
import { formatCurrency } from "../lib/format";
import { getErrorMessage } from "../lib/errors";

type ItemRow = {
  id: string;
  sku: string;
  name: string;
  price_default: number;
};

export default function CustomerPricePage() {
  const { id: customerId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [customerName, setCustomerName] = useState<string>("");
  const [customerType, setCustomerType] = useState<string>("UMUM");
  const [allItems, setAllItems] = useState<ItemRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const [search, setSearch] = useState("");
  const [originalPrices, setOriginalPrices] = useState<Record<string, number>>({});
  const [editedPrices, setEditedPrices] = useState<Record<string, string>>({});
  const [bulkValue, setBulkValue] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Client-side search + pagination — instant
  const filteredItems = useMemo(() => {
    if (!search.trim()) return allItems
    const q = search.toLowerCase()
    return allItems.filter(item =>
      item.name?.toLowerCase().includes(q) ||
      item.sku?.toLowerCase().includes(q)
    )
  }, [allItems, search])

  const totalCount = filteredItems.length
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))
  const items = useMemo(() => {
    const start = (page - 1) * pageSize
    return filteredItems.slice(start, start + pageSize)
  }, [filteredItems, page, pageSize])

  useEffect(() => { setPage(1) }, [search])
  const dirtyCount = useMemo(() => {
    let count = 0;
    Object.keys(editedPrices).forEach((itemId) => {
      const raw = editedPrices[itemId]?.trim() ?? "";
      const original = originalPrices[itemId];
      if (!raw) {
        if (original !== undefined) count += 1;
        return;
      }
      const value = Number(raw);
      if (Number.isNaN(value)) {
        count += 1;
        return;
      }
      if (original === undefined || Number(original) !== value) {
        count += 1;
      }
    });
    return count;
  }, [editedPrices, originalPrices]);

  const isRowDirty = (row: ItemRow) => {
    const raw = editedPrices[row.id]?.trim() ?? "";
    const original = originalPrices[row.id];
    if (!raw) return original !== undefined;
    const value = Number(raw);
    if (Number.isNaN(value)) return true;
    return original === undefined || Number(original) !== value;
  };

  const fetchCustomer = useCallback(async () => {
    if (!customerId) return;
    const { data, error } = await supabase
      .from("customers")
      .select("name, customer_type")
      .eq("id", customerId)
      .single();
    if (error) {
      setError(getErrorMessage(error));
      return;
    }
    setCustomerName(data?.name ?? "");
    setCustomerType(data?.customer_type ?? "UMUM");
  }, [customerId]);

  const fetchItems = useCallback(async () => {
    if (!customerId) return;
    setLoading(true);
    setError(null);
    try {
      // Fetch ALL active items — client-side search handles filtering
      const { data, error } = await supabase
        .from("items")
        .select("id, sku, name, price_default")
        .eq("is_active", true)
        .order("name", { ascending: true });

      if (error) throw error;

      const rows = (data || []) as ItemRow[];
      setAllItems(rows);

      if (rows.length === 0) {
        setOriginalPrices({});
        setEditedPrices({});
        setSelectedIds(new Set());
        return;
      }

      const itemIds = rows.map((r) => r.id);
      const { data: priceData, error: priceError } = await supabase
        .from("customer_item_prices")
        .select("item_id, price")
        .eq("customer_id", customerId)
        .in("item_id", itemIds);
      if (priceError) throw priceError;

      const priceMap: Record<string, number> = {};
      (priceData || []).forEach((p) => {
        priceMap[p.item_id as string] = Number(p.price);
      });
      setOriginalPrices(priceMap);

      const edited: Record<string, string> = {};
      rows.forEach((row) => {
        edited[row.id] = priceMap[row.id] !== undefined ? String(priceMap[row.id]) : "";
      });
      setEditedPrices(edited);
      setSelectedIds(new Set());
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Failed to load items"));
    } finally {
      setLoading(false);
    }
  }, [customerId]);

  useEffect(() => {
    fetchCustomer();
  }, [fetchCustomer]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const handleSave = async () => {
    if (!customerId) return;
    setSaving(true);
    setError(null);
    try {
      const upserts: { customer_id: string; item_id: string; price: number }[] = [];
      const deletes: string[] = [];

      // Save uses allItems — covers all pages, not just current page
      allItems.forEach((row) => {
        const raw = editedPrices[row.id]?.trim();
        const hasOriginal = originalPrices[row.id] !== undefined;
        if (!raw) {
          if (hasOriginal) deletes.push(row.id);
          return;
        }
        const price = Number(raw);
        if (Number.isNaN(price) || price < 0) return;
        upserts.push({ customer_id: customerId, item_id: row.id, price });
      });

      if (upserts.length > 0) {
        const { error } = await supabase
          .from("customer_item_prices")
          .upsert(upserts, { onConflict: "customer_id,item_id" });
        if (error) throw error;
      }

      if (deletes.length > 0) {
        const { error } = await supabase
          .from("customer_item_prices")
          .delete()
          .eq("customer_id", customerId)
          .in("item_id", deletes);
        if (error) throw error;
      }

      fetchItems();
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Failed to save prices"));
    } finally {
      setSaving(false);
    }
  };

  const toggleAll = (checked: boolean) => {
    if (!items.length) return;
    if (checked) {
      setSelectedIds(new Set(items.map((row) => row.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const toggleOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectedCount = selectedIds.size;
  const allSelected = items.length > 0 && selectedCount === items.length;

  if (!customerId) {
    return (
      <div className="w-full p-6">
        <Card>
          <CardHeader>
            <CardTitle>Customer tidak ditemukan</CardTitle>
          </CardHeader>
          <CardContent>
            <Button variant="outline" onClick={() => navigate("/customers")}>
              Kembali
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="w-full space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Harga Khusus</h2>
          <div className="mt-1">
            <CustomerBadge name={customerName || "Customer"} customerType={customerType} />
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Button variant="outline" onClick={() => navigate("/customers")}>
            <Icons.ArrowLeft className="w-4 h-4" />
            Back
          </Button>
          <Button onClick={handleSave} disabled={saving || dirtyCount === 0}>
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="bg-slate-50">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="w-full sm:w-80">
              <Input
                placeholder="Search item / SKU..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span className="px-2 py-1 rounded-full bg-white border">
                {dirtyCount > 0 ? `${dirtyCount} changes` : "No changes"}
              </span>
              <Button
                variant="outline"
                onClick={fetchItems}
                disabled={loading}
                size="icon"
                icon={<Icons.Refresh className="w-4 h-4" />}
                title="Refresh"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div className="flex-1">
                <div className="text-xs font-semibold text-slate-700 mb-1">
                  Mass Update (selected {selectedCount})
                </div>
                <Input
                  type="number"
                  inputMode="decimal"
                  placeholder="Set custom price for selected items"
                  value={bulkValue}
                  onChange={(e) => setBulkValue(e.target.value)}
                  containerClassName="!mb-0"
                />
              </div>
              <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:justify-end">
                <Button
                  variant="outline"
                  onClick={() => {
                    if (!selectedCount) return;
                    setEditedPrices((prev) => {
                      const next = { ...prev };
                      items.forEach((row) => {
                        if (!selectedIds.has(row.id)) return;
                        next[row.id] = bulkValue.trim();
                      });
                      return next;
                    });
                  }}
                  disabled={!selectedCount}
                >
                  Apply to Selected
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    if (!selectedCount) return;
                    setEditedPrices((prev) => {
                      const next = { ...prev };
                      items.forEach((row) => {
                        if (!selectedIds.has(row.id)) return;
                        next[row.id] =
                          originalPrices[row.id] !== undefined
                            ? String(originalPrices[row.id])
                            : "";
                      });
                      return next;
                    });
                  }}
                  disabled={!selectedCount}
                >
                  Reset Selected
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    if (!selectedCount) return;
                    setEditedPrices((prev) => {
                      const next = { ...prev };
                      items.forEach((row) => {
                        if (!selectedIds.has(row.id)) return;
                        next[row.id] = "";
                      });
                      return next;
                    });
                  }}
                  disabled={!selectedCount}
                >
                  Clear Selected
                </Button>
              </div>
            </div>
          </div>

          {error && (
            <div className="p-2 bg-red-50 text-red-700 text-sm rounded border border-red-200">
              {error}
            </div>
          )}

          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <Table>
              <TableHeader className="bg-slate-50">
                <TableRow>
                  <TableHead className="w-10">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={(e) => toggleAll(e.target.checked)}
                      aria-label="Select all"
                    />
                  </TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>Item</TableHead>
                  <TableHead>Default Price</TableHead>
                  <TableHead>Custom Price</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-6 text-gray-500">
                      Loading...
                    </TableCell>
                  </TableRow>
                ) : items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-6 text-gray-500">
                      No items found
                    </TableCell>
                  </TableRow>
                ) : (
                  items.map((row) => (
                    <TableRow key={row.id} className={isRowDirty(row) ? "bg-amber-50/50" : ""}>
                      <TableCell className="w-10">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(row.id)}
                          onChange={() => toggleOne(row.id)}
                          aria-label={`Select ${row.sku}`}
                        />
                      </TableCell>
                      <TableCell className="font-mono text-xs">{row.sku}</TableCell>
                      <TableCell>{row.name}</TableCell>
                      <TableCell className="text-sm text-slate-700">{formatCurrency(row.price_default)}</TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          inputMode="decimal"
                          placeholder="(use default)"
                          value={editedPrices[row.id] ?? ""}
                          onChange={(e) =>
                            setEditedPrices((prev) => ({
                              ...prev,
                              [row.id]: e.target.value,
                            }))
                          }
                          className="h-9"
                        />
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          <div className="flex items-center justify-between">
            <div className="text-xs text-gray-500">
              Page {page} / {totalPages} · {totalCount} items
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
              >
                Prev
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
              >
                Next
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
