import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { supabase } from "../supabaseClient";
import { Button } from "./ui/Button";
import { Input } from "./ui/Input";
import { ButtonSelect } from "./ui/ButtonSelect";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "./ui/Card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/Table";
import { Textarea } from "./ui/Textarea";
import { Icons } from "./ui/Icons";
import { useNavigate, useSearchParams } from "react-router-dom";
import { TotalFooter } from "./ui/TotalFooter";
import { Badge } from "./ui/Badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/Dialog";
import CustomerForm, { type Customer } from "./CustomerForm";
import { PricingService, type PriceCheckResult } from "../services/pricingService";
import { Combobox } from "./ui/Combobox";

import { ITEM_TYPES } from "../lib/constants";
import type { Item } from "../types/shared";
type SalesLine = {
    item_id: string;
    item_name: string;
    sku: string;
    size_name?: string;
    color_name?: string;
    uom: string;
    qty: number;
    unit_price: number;
    subtotal: number;
};

type Props = {
    onSuccess: (msg: string) => void;
    onError: (msg: string) => void;
    onSaved?: (salesId: string) => void;
    redirectOnSave?: boolean;
    initialSalesId?: string;
};

export function SalesEntryForm({ onSuccess, onError, onSaved, redirectOnSave = true, initialSalesId }: Props) {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [items, setItems] = useState<Item[]>([]);
    const [loading, setLoading] = useState(false);
    const [customerPriceMap, setCustomerPriceMap] = useState<Record<string, number>>({});

    // Form State
    const [customerId, setCustomerId] = useState("");
    const [salesDate, setSalesDate] = useState(new Date().toISOString().split("T")[0]);
    const [terms, setTerms] = useState<"CASH" | "CREDIT">("CASH");
    const [paymentMethods, setPaymentMethods] = useState<{ code: string; name: string }[]>([]);
    const [paymentMethodCode, setPaymentMethodCode] = useState("");
    const [notes, setNotes] = useState("");
    const [shippingFee, setShippingFee] = useState(0);
    const [discountAmount, setDiscountAmount] = useState(0);
    const [lines, setLines] = useState<SalesLine[]>([]);
    const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
    const [isEditCustomerModalOpen, setIsEditCustomerModalOpen] = useState(false);
    const [priceDeviations, setPriceDeviations] = useState<PriceCheckResult[]>([]);
    const [isPriceWarningOpen, setIsPriceWarningOpen] = useState(false);

    // Line Input State
    const [selectedItemId, setSelectedItemId] = useState("");
    const [qty, setQty] = useState(1);
    const [inputPrice, setInputPrice] = useState<number | null>(null);
    const [itemFilter, setItemFilter] = useState<"ALL" | keyof typeof ITEM_TYPES>("ALL");

    // Refs for Accessibility/Keyboard Nav
    const customerSelectRef = useRef<HTMLButtonElement>(null);
    // const itemSelectRef = useRef<HTMLButtonElement>(null); // Replaced by Combobox ref logic if needed, or simple focus
    const qtyInputRef = useRef<HTMLInputElement>(null);

    const getErrorMessage = useCallback((error: unknown) => {
        if (!error) return "Unknown error";
        if (typeof error === "string") return error;
        if (error instanceof Error) return error.message;
        if (typeof error === "object") {
            const err = error as { message?: string; error_description?: string; details?: string };
            const raw = err.message || err.error_description || err.details || "Unknown error";
            if (raw.includes("ck_sales_cash_method")) {
                return "Select Payment Method";
            }
            return raw;
        }
        return String(error);
    }, []);

    const normalizeLines = useCallback((source: SalesLine[]) => {
        const map = new Map<string, SalesLine>();
        source.forEach((line) => {
            const key = `${line.item_id}::${line.unit_price}::${line.uom}`;
            const existing = map.get(key);
            if (!existing) {
                map.set(key, { ...line });
                return;
            }
            const mergedQty = existing.qty + line.qty;
            map.set(key, {
                ...existing,
                qty: mergedQty,
                subtotal: existing.subtotal + line.subtotal
            });
        });
        return Array.from(map.values());
    }, []);

    const presetCustomerId = searchParams.get("customer") || "";

    const fetchMasterData = useCallback(async () => {
        try {
            const { data: custData, error: custError } = await supabase
                .from("customers")
                .select("*")
                .eq("is_active", true);
            if (custError) throw custError;

            const { data: itemData, error: itemError } = await supabase
                .from("items")
                .select("id, name, sku, uom, price_default, price_khusus, type, sizes(name), colors(name), inventory_stock(qty_on_hand)")
                .eq("is_active", true)
                .eq("is_active", true)
                .in("type", [ITEM_TYPES.TRADED, ITEM_TYPES.FINISHED_GOOD]);
            if (itemError) throw itemError;

            const { data: methodData, error: methodError } = await supabase
                .from("payment_methods")
                .select("code, name")
                .eq("is_active", true)
                .order("code", { ascending: true });
            if (methodError) throw methodError;

            setCustomers(custData || []);
            const mappedItems = (itemData || []).map((item) => ({
                ...item,
                size_name: (item.sizes as unknown as { name: string } | null)?.name,
                color_name: (item.colors as unknown as { name: string } | null)?.name,
                stock_qty: Array.isArray(item.inventory_stock)
                    ? Number(item.inventory_stock[0]?.qty_on_hand ?? 0)
                    : Number((item.inventory_stock as { qty_on_hand?: number } | null)?.qty_on_hand ?? 0),
            }));
            const itemsWithLabel = mappedItems.map(i => ({
                ...i,
                display_label: `${i.sku} - ${i.name}` +
                    (i.size_name || i.color_name ? ` (${[i.size_name, i.color_name].filter(Boolean).join(", ")})` : "")
            }));
            setItems(itemsWithLabel);
            setPaymentMethods(methodData || []);
        } catch (err: unknown) {
            onError(getErrorMessage(err));
        }
    }, [onError, getErrorMessage]);

    useEffect(() => {
        fetchMasterData();
    }, [fetchMasterData]);

    // Fetch existing sales data if editing
    useEffect(() => {
        if (!initialSalesId) return;

        const loadSales = async () => {
            setLoading(true);
            try {
                // Fetch header
                const { data: saleData, error: saleError } = await supabase
                    .from('sales')
                    .select('*')
                    .eq('id', initialSalesId)
                    .single();

                if (saleError) throw saleError;

                if (saleData.status !== 'DRAFT') {
                    throw new Error(`Cannot edit ${saleData.status} sales.`);
                }

                setCustomerId(saleData.customer_id);
                setSalesDate(saleData.sales_date);
                setTerms(saleData.terms);
                setPaymentMethodCode(saleData.payment_method_code || "");
                setNotes(saleData.notes || '');
                setShippingFee(Number(saleData.shipping_fee) || 0);
                setDiscountAmount(Number(saleData.discount_amount) || 0);

                // Fetch items
                const { data: itemsData, error: itemsError } = await supabase
                    .from('sales_items')
                    .select(`
                        item_id,
                        qty,
                        unit_price,
                        subtotal,
                        uom_snapshot,
                        items (
                            name,
                            sku,
                            price_default,
                            price_khusus,
                            sizes ( name ),
                            colors ( name )
                        )
                    `)
                    .eq('sales_id', initialSalesId);

                if (itemsError) throw itemsError;

                const { data: customerData } = await supabase
                    .from("customers")
                    .select("customer_type")
                    .eq("id", saleData.customer_id)
                    .single();
                const customerType = (customerData as { customer_type?: string } | null)?.customer_type || "UMUM";

                let customPriceMap: Record<string, number> = {};
                if (customerType === "CUSTOM") {
                    const { data: priceData } = await supabase
                        .from("customer_item_prices")
                        .select("item_id, price")
                        .eq("customer_id", saleData.customer_id)
                        .eq("is_active", true);
                    customPriceMap = (priceData || []).reduce((acc, row) => {
                        acc[row.item_id as string] = Number(row.price);
                        return acc;
                    }, {} as Record<string, number>);
                    setCustomerPriceMap(customPriceMap);
                }

                const loadedLines: SalesLine[] = itemsData?.map(item => {
                    const iData = Array.isArray(item.items) ? item.items[0] : item.items;
                    const basePrice = Number(iData?.price_default || 0);
                    const khususPrice = Number(iData?.price_khusus || basePrice);
                    let nextPrice = Number(item.unit_price);
                    if (customerType === "CUSTOM") {
                        nextPrice = customPriceMap[item.item_id] ?? basePrice;
                    } else if (customerType === "KHUSUS") {
                        nextPrice = khususPrice;
                    } else {
                        nextPrice = basePrice;
                    }
                    const sizeName = (iData as { sizes?: { name?: string } })?.sizes?.name;
                    const colorName = (iData as { colors?: { name?: string } })?.colors?.name;
                    return {
                        item_id: item.item_id,
                        item_name: iData?.name || 'Unknown',
                        sku: iData?.sku || '',
                        size_name: sizeName,
                        color_name: colorName,
                        uom: item.uom_snapshot,
                        qty: item.qty,
                        unit_price: nextPrice,
                        subtotal: item.qty * nextPrice
                    };
                }) || [];

                const uniqueLines = normalizeLines(loadedLines);
                setLines(uniqueLines);
            } catch (err: unknown) {
                onError(getErrorMessage(err));
            } finally {
                setLoading(false);
            }
        };

        loadSales();
    }, [initialSalesId, onError, getErrorMessage, normalizeLines]);

    useEffect(() => {
        if (!customerId) {
            customerSelectRef.current?.focus();
        }
    }, [customerId]);

    useEffect(() => {
        if (presetCustomerId && !customerId) {
            setCustomerId(presetCustomerId);
        }
    }, [presetCustomerId, customerId]);

    async function handleCustomerCreated() {
        setIsCustomerModalOpen(false);
        await fetchMasterData();
        const { data, error } = await supabase
            .from("customers")
            .select("id")
            .eq("is_active", true)
            .order("created_at", { ascending: false })
            .limit(1)
            .single();
        if (!error && data?.id) {
            setCustomerId(data.id);
        }
    }

    async function handleCustomerUpdated() {
        setIsEditCustomerModalOpen(false);
        await fetchMasterData(); // Refresh list to get new type
        // Prices will auto-update via the existing useEffect that watches [customerId] and [items]
        // because we updated the master list 'customers', and `customers.find(c => c.id === customerId)` will return the updated object.
        onSuccess("Customer updated! Cart prices adjusted.");
    }

    useEffect(() => {
        if (terms === "CREDIT") {
            setPaymentMethodCode("");
        }
    }, [terms]);

    useEffect(() => {
        if (!customerId) {
            setCustomerPriceMap({});
            return;
        }
        const customer = customers.find((c) => c.id === customerId);
        if (customer?.customer_type !== 'CUSTOM') {
            setCustomerPriceMap({});
            return;
        }
        const loadPrices = async () => {
            const { data, error } = await supabase
                .from("customer_item_prices")
                .select("item_id, price")
                .eq("customer_id", customerId)
                .eq("is_active", true);
            if (error) {
                onError(getErrorMessage(error));
                return;
            }
            const map: Record<string, number> = {};
            (data || []).forEach((row) => {
                map[row.item_id as string] = Number(row.price);
            });
            setCustomerPriceMap(map);
        };
        loadPrices();
    }, [customerId, onError, customers, getErrorMessage]);

    useEffect(() => {
        if (!customerId) return;
        const customer = customers.find((c) => c.id === customerId);
        setLines((prev) =>
            prev.map((line) => {
                const item = items.find((i) => i.id === line.item_id);
                if (!item) return line;
                let unitPrice = item.price_default;
                if (customer?.customer_type === 'CUSTOM') {
                    const override = customerPriceMap[line.item_id];
                    unitPrice = override !== undefined ? override : item.price_default;
                } else if (customer?.customer_type === 'KHUSUS') {
                    unitPrice = item.price_khusus;
                }
                if (unitPrice === line.unit_price) return line;
                return {
                    ...line,
                    unit_price: unitPrice,
                    subtotal: unitPrice * line.qty,
                };
            })
        );
        // Clear manual input price when customer changes to avoid stale data
        setInputPrice(null);
    }, [customerId, customerPriceMap, items, customers]); // Removed lines.length to prevent overwrite on add

    const selectedItem = items.find((i) => i.id === selectedItemId);

    // Reset manual input price when selecting a different item
    useEffect(() => {
        setInputPrice(null);
    }, [selectedItemId]);

    const existingQtyForSelected = lines
        .filter((l) => l.item_id === selectedItemId)
        .reduce((sum, l) => sum + l.qty, 0);
    const requestedQty = existingQtyForSelected + qty;
    const stockQty = selectedItem?.stock_qty ?? null;
    const isOverStock = stockQty !== null && requestedQty > stockQty;

    function addItem() {
        if (!selectedItemId) return;
        const item = items.find((i) => i.id === selectedItemId);
        if (!item) return;

        // Stock Validation
        const currentStock = item.stock_qty ?? 0;
        const existingQty = lines
            .filter((l) => l.item_id === selectedItemId)
            .reduce((sum, l) => sum + l.qty, 0);
        const totalRequested = existingQty + qty;

        if (totalRequested > currentStock) {
            onError(`Stock tidak cukup! Tersedia: ${currentStock}, Diminta: ${totalRequested}`);
            return;
        }

        const customer = customers.find((c) => c.id === customerId);
        let price = item.price_default;
        if (customer?.customer_type === 'CUSTOM') {
            price = customerPriceMap[selectedItemId] !== undefined
                ? customerPriceMap[selectedItemId]
                : item.price_default;
        } else if (customer?.customer_type === 'KHUSUS') {
            price = item.price_khusus;
        }

        const finalUnitPrice = inputPrice !== null ? inputPrice : price;
        const newLine: SalesLine = {
            item_id: item.id,
            item_name: item.name,
            sku: item.sku,
            size_name: item.size_name,
            color_name: item.color_name,
            uom: item.uom,
            qty: qty,
            unit_price: finalUnitPrice,
            subtotal: qty * finalUnitPrice,
        };

        setLines((prev) => {
            const existingIndex = prev.findIndex(
                (l) => l.item_id === newLine.item_id && l.unit_price === newLine.unit_price
            );
            if (existingIndex === -1) return [...prev, newLine];
            const next = [...prev];
            const existing = next[existingIndex];
            const mergedQty = existing.qty + newLine.qty;
            next[existingIndex] = {
                ...existing,
                qty: mergedQty,
                subtotal: mergedQty * existing.unit_price,
            };
            return next;
        });
        setSelectedItemId("");
        setQty(1);
        setInputPrice(null);

        // Auto-focus back to item select for rapid entry
        // Slight delay to allow state update and UI render if needed, but usually direct focus works
        setTimeout(() => {
            // For Combobox, we might want to focus the trigger again if possible, or just leave it.
            // If we want to focus the trigger, we need a ref to it.
            // For now, let's assume user might want to check the list.
            const btn = document.querySelector('button[role="combobox"]');
            if (btn instanceof HTMLElement) btn.focus();
        }, 0);
    }

    function removeLine(index: number) {
        setLines(lines.filter((_, i) => i !== index));
    }

    const itemsTotal = useMemo(() => lines.reduce((sum, l) => sum + l.subtotal, 0), [lines]);
    const totalAmount = useMemo(
        () => itemsTotal + (shippingFee || 0) - (discountAmount || 0),
        [itemsTotal, shippingFee, discountAmount]
    );



    const performSave = useCallback(async () => {
        setLoading(true);
        try {
            let salesId = initialSalesId;

            if (initialSalesId) {
                // UPDATE existing
                const { error: headerError } = await supabase
                    .from("sales")
                    .update({
                        customer_id: customerId,
                        sales_date: salesDate,
                        terms: terms,
                        notes: notes || null,
                        total_amount: totalAmount,
                        shipping_fee: shippingFee || 0,
                        discount_amount: discountAmount || 0,
                        payment_method_code: terms === "CASH" ? paymentMethodCode : null,
                        // Ensure status remains DRAFT or whatever logic required, usually Update doesn't change status to DRAFT if it was DRAFT
                    })
                    .eq("id", initialSalesId)
                    .eq("status", "DRAFT"); // Security check

                if (headerError) throw headerError;

                salesId = initialSalesId;
            } else {
                // INSERT new
                const { data: salesData, error: salesError } = await supabase
                    .from("sales")
                    .insert([
                        {
                            customer_id: customerId,
                            sales_date: salesDate,
                            terms: terms,
                            status: "DRAFT",
                            notes: notes || null,
                            total_amount: totalAmount,
                            shipping_fee: shippingFee || 0,
                            discount_amount: discountAmount || 0,
                            payment_method_code: terms === "CASH" ? paymentMethodCode : null
                        },
                    ])
                    .select()
                    .single();

                if (salesError) throw salesError;
                salesId = salesData.id;
            }

            // AUTO-SAVE CUSTOM PRICES
            // Only if customer is CUSTOM
            const currentCustomer = customers.find(c => c.id === customerId);
            if (currentCustomer?.customer_type === 'CUSTOM' && lines.length > 0) {
                const upserts = lines.map(line => ({
                    customer_id: customerId,
                    item_id: line.item_id,
                    price: line.unit_price
                }));

                // Perform upsert (ignore duplicates/update existing)
                const { error: priceError } = await supabase
                    .from('customer_item_prices')
                    .upsert(upserts, { onConflict: 'customer_id,item_id' });

                if (priceError) {
                    console.error("Failed to auto-save custom prices:", priceError);
                    // We don't block the sales save for this, but ideally we should warn or log
                } else {
                    // Update local map to reflect saved prices immediately
                    const newMap = { ...customerPriceMap };
                    upserts.forEach(u => newMap[u.item_id] = u.price);
                    setCustomerPriceMap(newMap);
                }
            }

            const normalizedLines = normalizeLines(lines);
            if (normalizedLines.length !== lines.length) {
                setLines(normalizedLines);
            }

            const lineData = normalizedLines.map((l) => ({
                sales_id: salesId,
                item_id: l.item_id,
                qty: l.qty,
                unit_price: l.unit_price,
                subtotal: l.subtotal,
                uom_snapshot: l.uom,
            }));

            // Use RPC for Atomic Update (Prevents Duplicate Items Bug)
            const { error: rpcError } = await supabase.rpc('rpc_update_sales_draft_items', {
                p_sales_id: salesId,
                p_items: lineData
            });

            if (rpcError) throw rpcError;

            // Only clear form if creating new, or maybe clear anyway? 
            // If editing, we probably want to navigate away or close.
            if (!initialSalesId) {
                setLines([]);
                setCustomerId("");
                setTerms("CASH");
                setPaymentMethodCode("");
                setNotes("");
                setShippingFee(0);
                setDiscountAmount(0);
            }

            if (salesId) {
                onSuccess(initialSalesId ? "Sales Updated!" : `Draft Created! ID: ${salesId}`);
                onSaved?.(salesId);
            }
            if (redirectOnSave) {
                navigate(`/sales/${salesId}`);
            }
        } catch (err: unknown) {
            onError(getErrorMessage(err));
        } finally {
            setLoading(false);
        }
    }, [
        initialSalesId,
        customerId,
        salesDate,
        terms,
        notes,
        totalAmount,
        shippingFee,
        discountAmount,
        paymentMethodCode,
        lines,
        customerPriceMap,
        customers,
        normalizeLines,
        onSuccess,
        onSaved,
        redirectOnSave,
        navigate,
        onError,
        getErrorMessage,
    ]);

    const handleSaveDraft = useCallback(async () => {
        if (!customerId) {
            onError("Select Customer");
            return;
        }
        if (lines.length === 0) {
            onError("Add items");
            return;
        }

        // PRICE DEVIATION CHECK
        const customer = customers.find(c => c.id === customerId);
        const customerType = customer?.customer_type === 'CUSTOM' || customer?.customer_type === 'KHUSUS' || customer?.customer_type === 'UMUM'
            ? customer.customer_type
            : 'UMUM';
        if (customer && customerType !== 'CUSTOM') {
            try {
                const deviations = await PricingService.checkPriceDeviations(
                    lines.map(l => ({ id: l.item_id, price: l.unit_price })),
                    customerType
                );

                if (deviations.length > 0) {
                    setPriceDeviations(deviations);
                    setIsPriceWarningOpen(true);
                    return; // Stop here, wait for confirmation
                }
            } catch (err) {
                console.error("Price check failed", err);
                // Fallback or alert? For now proceed or alert.
            }
        }

        await performSave();
    }, [customerId, lines, customers, onError, performSave]); // Added performSave to deps

    const handleConfirmPriceChange = async () => {
        setIsPriceWarningOpen(false);
        setLoading(true);
        try {
            await PricingService.promoteToCustomAndSavePrices(customerId, priceDeviations);
            onSuccess("Customer converted to CUSTOM and prices updated.");
            await fetchMasterData(); // Refresh customer type in UI
            await performSave(); // Proceed with save
        } catch (err) {
            onError(getErrorMessage(err));
            setLoading(false);
        }
    };

    // Keyboard Shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "F2") {
                e.preventDefault();
                handleSaveDraft();
            }
            if (e.key === "F4") {
                e.preventDefault();
                // Focus Combobox Trigger
                const btn = document.querySelector('button[role="combobox"]');
                if (btn instanceof HTMLElement) {
                    btn.focus();
                    btn.click(); // Optional: open it immediately
                }
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [handleSaveDraft]);

    return (
        <>
            <Card className="shadow-md border-gray-200 h-full">
                <CardHeader className="bg-gray-50 border-b border-gray-100 pb-4">
                    <CardTitle className="text-lg text-blue-800">
                        {initialSalesId ? "Edit Sales (DRAFT)" : "New Sales Order"}
                    </CardTitle>
                    {initialSalesId && <p className="text-xs text-gray-500 mt-1">ID: {initialSalesId?.substring(0, 8)}</p>}
                </CardHeader>
                <CardContent className="pt-6">
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        {/* Left Section */}
                        <div className="lg:col-span-1 space-y-4">
                            <div>
                                <div className="flex items-center justify-between mb-1">
                                    <label className="text-sm font-medium text-[var(--text-main)]">Customer</label>
                                    <div className="flex gap-2">
                                        {customerId && (
                                            <button
                                                type="button"
                                                onClick={() => setIsEditCustomerModalOpen(true)}
                                                className="text-xs text-orange-600 hover:text-orange-800 font-medium flex items-center gap-1"
                                            >
                                                <Icons.Edit className="w-3 h-3" />
                                                Edit
                                            </button>
                                        )}
                                        <button
                                            type="button"
                                            onClick={() => setIsCustomerModalOpen(true)}
                                            className="text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1"
                                        >
                                            <Icons.Plus className="w-3 h-3" />
                                            New
                                        </button>
                                    </div>
                                </div>
                                <Combobox
                                    ref={customerSelectRef}
                                    containerClassName="mb-3"
                                    value={customerId}
                                    onChange={(val) => setCustomerId(val)}
                                    placeholder="-- Select Customer --"
                                    searchPlaceholder="Search customer..."
                                    options={customers.map((c) => ({
                                        label: c.name,
                                        value: c.id,
                                        keywords: [c.name],
                                        content: (
                                            <div className="flex items-center justify-between w-full gap-2">
                                                <span className="font-medium truncate">{c.name}</span>
                                                <Badge
                                                    variant={c.customer_type === 'KHUSUS' ? 'success' : c.customer_type === 'CUSTOM' ? 'warning' : 'secondary'}
                                                    className="h-5 px-1.5 text-[10px] uppercase ml-auto shrink-0"
                                                >
                                                    {c.customer_type}
                                                </Badge>
                                            </div>
                                        )
                                    }))}
                                />
                            </div>
                            <Input
                                label="Date"
                                type="date"
                                value={salesDate}
                                onChange={(e) => setSalesDate(e.target.value)}
                            />
                            <ButtonSelect
                                label="Terms"
                                value={terms}
                                onChange={(val) => setTerms(val as "CASH" | "CREDIT")}
                                options={[
                                    { label: "CASH", value: "CASH" },
                                    { label: "CREDIT", value: "CREDIT" },
                                ]}
                            />
                            {terms === "CASH" && (
                                <ButtonSelect
                                    label="Payment Method"
                                    value={paymentMethodCode}
                                    onChange={(val) => setPaymentMethodCode(val)}
                                    options={paymentMethods.map((m) => ({
                                        label: `${m.name} (${m.code})`,
                                        value: m.code,
                                    }))}
                                />
                            )}
                            <Input
                                label="Ongkir"
                                type="number"
                                inputMode="decimal"
                                min="0"
                                step="1"
                                placeholder="0"
                                value={shippingFee === 0 ? "" : shippingFee}
                                onFocus={(e) => e.target.select()}
                                onChange={(e) => setShippingFee(Number(e.target.value))}
                            />
                            <Input
                                label="Diskon"
                                type="number"
                                inputMode="decimal"
                                min="0"
                                step="1"
                                placeholder="0"
                                value={discountAmount === 0 ? "" : discountAmount}
                                onFocus={(e) => e.target.select()}
                                onChange={(e) => setDiscountAmount(Number(e.target.value))}
                            />
                            <Textarea
                                label="Notes (Internal)"
                                placeholder="Optional delivery notes or instructions..."
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                            />
                        </div>

                        {/* Right Section */}
                        <div className="lg:col-span-2 space-y-4">
                            {/* Item Entry */}
                            <div className={`bg-blue-50/50 p-4 rounded-lg border border-blue-100 ${!customerId ? 'opacity-60 pointer-events-none' : ''}`}>
                                <h4 className="font-semibold mb-3 text-sm text-blue-900 uppercase tracking-wide">
                                    Add Items
                                </h4>
                                <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 items-stretch sm:items-end">
                                    <div className="flex-grow">
                                        <div className="flex flex-col gap-1.5 mb-1">
                                            <div className="flex justify-between items-center">
                                                <label className="text-sm font-medium text-[var(--text-main)]">Product (F4)</label>
                                                {/* Mini Filter Tabs */}
                                                <div className="flex bg-gray-100 p-0.5 rounded-lg">
                                                    {(["ALL", ITEM_TYPES.TRADED, ITEM_TYPES.FINISHED_GOOD] as const).map(type => (
                                                        <button
                                                            key={type}
                                                            type="button"
                                                            onClick={() => {
                                                                setItemFilter(type);
                                                                setSelectedItemId("");
                                                                setInputPrice(null);
                                                            }}
                                                            className={`px-3 py-1 text-xs font-semibold rounded-full transition-colors ${itemFilter === type
                                                                ? "bg-indigo-100 text-indigo-700 ring-1 ring-indigo-200"
                                                                : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                                                                }`}
                                                        >
                                                            {type === "TRADED" ? "Traded" : type === "FINISHED_GOOD" ? "FG" : "All"}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                            <Combobox
                                                value={selectedItemId}
                                                onChange={(val) => {
                                                    setSelectedItemId(val);
                                                    if (val) {
                                                        setTimeout(() => qtyInputRef.current?.focus(), 0);
                                                    }
                                                }}
                                                placeholder="Select Item..."
                                                searchPlaceholder="Search SKU or Name..."
                                                options={items
                                                    .filter(i => itemFilter === "ALL" ? true : i.type === itemFilter)
                                                    // Re-checking fetchMasterData... it fetches: id, name, sku, uom... but NOT TYPE?
                                                    // Ah, fetchMasterData filters .in("type", ["TRADED", "FINISHED_GOOD"]).
                                                    // But we didn't select 'type' column to be stored in state 'items'.
                                                    // I need to add 'type' to the fetch logic first!
                                                    // Falling back to filtering by what we have or fixing fetch. Refactoring fetch in next step if needed.
                                                    // Actually, let's assume we fetch it. I will add 'type' to fetch and Item type definition in a separate edit or assume I fix it.
                                                    // For now, I will map basic options without filter until I fix the fetch.
                                                    .map((i) => ({
                                                        label: i.display_label || `${i.sku} - ${i.name}`,
                                                        value: i.id,
                                                        keywords: [i.sku, i.name],
                                                        content: (
                                                            <div className="flex justify-between w-full">
                                                                <span><span className="font-mono text-gray-500 mr-2">{i.sku}</span>{i.name}
                                                                    {(i.size_name || i.color_name) && (
                                                                        <span className="ml-1 text-slate-500 text-xs">
                                                                            ({[i.size_name, i.color_name].filter(Boolean).join(", ")})
                                                                        </span>
                                                                    )}
                                                                </span>
                                                                {i.stock_qty !== undefined && (
                                                                    <span className={`text-xs ${Number(i.stock_qty) <= 0 ? 'text-red-500' : 'text-green-600'}`}>
                                                                        Stock: {i.stock_qty}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        )
                                                    }))}
                                                className="!mb-0"
                                            />
                                        </div>
                                    </div>
                                    <div className="w-28">
                                        <Input
                                            ref={qtyInputRef}
                                            label="Qty"
                                            type="number"
                                            inputMode="numeric"
                                            min="1"
                                            step="1"
                                            value={qty}
                                            onFocus={(e) => e.target.select()}
                                            onChange={(e) => setQty(parseInt(e.target.value) || 1)}
                                            onKeyDown={(e) => {
                                                if (e.key === "Enter") {
                                                    e.preventDefault();
                                                    addItem();
                                                }
                                            }}
                                            containerClassName="!mb-0"
                                        />
                                    </div>
                                    <div className="w-36">
                                        <Input
                                            label="Price Sales"
                                            type="number"
                                            step="1"
                                            value={(() => {
                                                if (inputPrice !== null) return inputPrice;
                                                const item = items.find((i) => i.id === selectedItemId);
                                                if (!item) return "";
                                                const customer = customers.find((c) => c.id === customerId);
                                                let price = item.price_default;
                                                if (customer?.customer_type === 'CUSTOM') {
                                                    const override = customerPriceMap[selectedItemId];
                                                    price = override !== undefined ? override : item.price_default;
                                                } else if (customer?.customer_type === 'KHUSUS') {
                                                    price = item.price_khusus;
                                                }
                                                return price;
                                            })()}
                                            onChange={(e) => setInputPrice(Number(e.target.value))}
                                            onFocus={(e) => e.target.select()}
                                            readOnly={(() => {
                                                const customer = customers.find((c) => c.id === customerId);
                                                return customer?.customer_type !== 'CUSTOM';
                                            })()}
                                            className={(() => {
                                                const customer = customers.find((c) => c.id === customerId);
                                                return customer?.customer_type !== 'CUSTOM' ? "bg-gray-100 text-gray-500 cursor-not-allowed" : "";
                                            })()}
                                            containerClassName="!mb-0"
                                        />
                                    </div>
                                    <div className="">
                                        <Button
                                            type="button"
                                            onClick={addItem}
                                            className="w-full sm:w-auto min-h-[44px]"
                                            disabled={!selectedItemId || !customerId}
                                        >
                                            Add Item
                                        </Button>
                                    </div>
                                </div>
                                {selectedItemId && (
                                    <div className={`mt-2 text-xs flex flex-wrap gap-x-3 ${isOverStock ? "text-red-600" : "text-gray-500"}`}>
                                        <span>Stok: {stockQty ?? 0}</span>
                                        <span>Cart: {existingQtyForSelected}</span>
                                        <span>Input: {qty}</span>
                                        {isOverStock && <span>(melebihi stok)</span>}
                                        {(() => {
                                            const customer = customers.find((c) => c.id === customerId);
                                            if (customerId && customer?.customer_type !== 'CUSTOM') {
                                                return <span className="text-orange-600 italic">*Ubah Customer Type ke CUSTOM untuk edit harga</span>;
                                            }
                                            return null;
                                        })()}
                                    </div>
                                )}
                            </div>

                            {/* Lines Table */}
                            <div className="border border-gray-200 rounded-lg overflow-hidden shadow-sm">
                                <div className="max-h-[420px] overflow-y-auto">
                                    <Table>
                                        <TableHeader className="bg-gray-50">
                                            <TableRow>
                                                <TableHead>Item</TableHead>
                                                <TableHead>Size</TableHead>
                                                <TableHead>Color</TableHead>
                                                <TableHead>Qty</TableHead>
                                                <TableHead>Price</TableHead>
                                                <TableHead>Subtotal</TableHead>
                                                <TableHead className="w-10">&nbsp;</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {lines.length === 0 ? (
                                                <TableRow>
                                                    <TableCell
                                                        colSpan={7}
                                                        className="text-center text-gray-400 py-8 italic bg-gray-50/30"
                                                    >
                                                        No items added to cart
                                                    </TableCell>
                                                </TableRow>
                                            ) : (
                                                lines.map((l, i) => (
                                                    <TableRow key={i} className="hover:bg-gray-50/50">
                                                        <TableCell className="font-medium text-gray-900">
                                                            {l.item_name}
                                                            <div className="text-xs text-gray-500">
                                                                {l.sku}
                                                            </div>
                                                        </TableCell>
                                                        <TableCell className="text-sm text-gray-600">
                                                            {l.size_name || '-'}
                                                        </TableCell>
                                                        <TableCell className="text-sm text-gray-600">
                                                            {l.color_name || '-'}
                                                        </TableCell>
                                                        <TableCell>
                                                            {l.qty}{" "}
                                                            <span className="text-xs text-gray-500">
                                                                {l.uom}
                                                            </span>
                                                        </TableCell>
                                                        <TableCell>
                                                            {l.unit_price.toLocaleString()}
                                                        </TableCell>
                                                        <TableCell className="font-semibold">
                                                            {l.subtotal.toLocaleString()}
                                                        </TableCell>
                                                        <TableCell>
                                                            <button
                                                                className="text-gray-400 hover:text-red-600 transition-colors"
                                                                onClick={() => removeLine(i)}
                                                            >
                                                                <Icons.Trash className="w-4 h-4" />
                                                            </button>
                                                        </TableCell>
                                                    </TableRow>
                                                ))
                                            )}
                                        </TableBody>
                                    </Table>
                                </div>
                                <div className="bg-white">
                                    <TotalFooter label="Items Total" amount={itemsTotal} />
                                    <TotalFooter label="Ongkir" amount={shippingFee || 0} />
                                    <TotalFooter label="Diskon" amount={discountAmount || 0} />
                                    <TotalFooter label="Total Amount" amount={totalAmount} amountClassName="text-blue-600" />
                                </div>
                            </div>
                        </div>
                    </div>
                </CardContent>
                <CardFooter className="bg-gray-50 border-t border-gray-100 p-4 hidden md:flex">
                    <Button
                        onClick={handleSaveDraft}
                        disabled={loading}
                        className="w-full h-12 text-lg shadow-sm"
                        icon={<Icons.Save className="w-5 h-5" />}
                    >
                        {loading ? "Saving..." : "Save Draft"}
                    </Button>
                </CardFooter>
            </Card>

            <div className="md:hidden fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 backdrop-blur px-4 py-3 shadow-lg">
                <Button
                    onClick={handleSaveDraft}
                    className="w-full"
                    disabled={loading}
                    isLoading={loading}
                >
                    Save Draft
                </Button>
            </div>

            <Dialog isOpen={isCustomerModalOpen} onClose={() => setIsCustomerModalOpen(false)}>
                <DialogHeader>
                    <DialogTitle>New Customer</DialogTitle>
                </DialogHeader>
                <DialogContent>
                    <CustomerForm
                        onSuccess={handleCustomerCreated}
                        onCancel={() => setIsCustomerModalOpen(false)}
                    />
                </DialogContent>
            </Dialog>

            <Dialog isOpen={isEditCustomerModalOpen} onClose={() => setIsEditCustomerModalOpen(false)}>
                <DialogHeader>
                    <DialogTitle>Edit Customer</DialogTitle>
                </DialogHeader>
                <DialogContent>
                    <CustomerForm
                        initialData={customers.find(c => c.id === customerId)}
                        onSuccess={handleCustomerUpdated}
                        onCancel={() => setIsEditCustomerModalOpen(false)}
                    />
                </DialogContent>
            </Dialog>
            <Dialog isOpen={isPriceWarningOpen} onClose={() => setIsPriceWarningOpen(false)}>
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-orange-600">
                        <Icons.Warning className="w-5 h-5" />
                        Price Change Detected
                    </DialogTitle>
                </DialogHeader>
                <DialogContent>
                    <div className="space-y-4">
                        <p className="text-sm text-gray-600">
                            You have modified the prices for <strong>{priceDeviations.length} items</strong>.
                        </p>
                        <div className="bg-orange-50 p-3 rounded-md border border-orange-100 text-sm text-orange-800">
                            <p className="font-semibold mb-1">Action Required:</p>
                            <ul className="list-disc pl-4 space-y-1">
                                <li>Customer type will be changed to <span className="font-bold">CUSTOM</span>.</li>
                                <li>The new prices will be saved for future transactions.</li>
                            </ul>
                        </div>
                        <div className="flex justify-end gap-3 pt-4">
                            <Button variant="outline" onClick={() => setIsPriceWarningOpen(false)}>
                                Cancel
                            </Button>
                            <Button onClick={handleConfirmPriceChange} disabled={loading} className="bg-orange-600 hover:bg-orange-700 text-white">
                                {loading ? 'Updating...' : 'Confirm & Save'}
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
}
