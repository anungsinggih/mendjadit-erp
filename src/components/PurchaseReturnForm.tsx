import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "../supabaseClient";
import { Button } from "./ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/Card";
import { Select } from "./ui/Select";
import { ButtonSelect } from "./ui/ButtonSelect";
import { Input } from "./ui/Input";
import { Textarea } from "./ui/Textarea";
import { Separator } from "./ui/Separator";
import { Icons } from "./ui/Icons";
import { useConfirm } from "./ui/ConfirmDialogContext";

import { formatCurrency } from "../lib/format";
import { getErrorMessage } from "../lib/errors";
import { useLocation, useNavigate } from "react-router-dom";
import { useQueryClient } from '../hooks/useQueries';

type Purchase = {
    id: string
    purchase_no: string
    purchase_date: string
    vendor: { name: string }
    total_amount: number
    terms?: string
    payment_method_code?: string | null
}

type PurchaseItem = {
    id: string
    item_id: string
    item: { sku: string; name: string }
    qty: number
    unit_cost: number
    uom_snapshot: string
}

type ReturnItem = {
    item_id: string
    sku: string
    name: string
    qty: number
    unit_cost: number
    uom: string
    subtotal: number
}

type Props = {
    onSuccess: (msg: string) => void;
    onError: (msg: string) => void;
    embedded?: boolean;
    initialPurchaseId?: string;
    onSaved?: (returnId: string) => void;
    onCancel?: () => void;
};

export function PurchaseReturnForm({ onSuccess, onError, embedded = false, initialPurchaseId, onSaved, onCancel }: Props) {
    const navigate = useNavigate()
    const { confirm } = useConfirm()
    const queryClient = useQueryClient()
    const [postedPurchases, setPostedPurchases] = useState<Purchase[]>([])
    const [selectedPurchaseId, setSelectedPurchaseId] = useState('')
    const [purchaseItems, setPurchaseItems] = useState<PurchaseItem[]>([])
    const [lines, setLines] = useState<ReturnItem[]>([])
    const [loading, setLoading] = useState(false)
    const [draftReturnDate, setDraftReturnDate] = useState<string | null>(null)
    const [paymentMethodCode, setPaymentMethodCode] = useState('CASH')
    const [notes, setNotes] = useState('')
    const [paymentMethods, setPaymentMethods] = useState<{ code: string; name: string; is_active: boolean }[]>([])
    const refundMethodOptions = useMemo(() => {
        if (paymentMethods.length > 0) {
            return paymentMethods.map((m) => ({
                label: `${m.name} (${m.code})`,
                value: m.code
            }))
        }
        return [{ label: 'CASH', value: 'CASH' }]
    }, [paymentMethods])
    const linesTotal = useMemo(() => lines.reduce((sum, line) => sum + (line.subtotal || 0), 0), [lines])
    const availableRows = purchaseItems.map((item) => ({
        ...item,
        _inputId: `qty-${item.id}`,
    }))
    const location = useLocation()
    const draftId = useMemo(() => new URLSearchParams(location.search).get('draft'), [location.search])
    const purchaseParamId = useMemo(() => new URLSearchParams(location.search).get('purchase'), [location.search])
    const isEditing = Boolean(draftId)

    const fetchPostedPurchases = useCallback(async () => {
        const { data, error } = await supabase
            .from('purchases')
            .select('*, vendor:vendors(name)')
            .eq('status', 'POSTED')
            .order('purchase_date', { ascending: false })
            .limit(50)

        if (error) onError(error.message)
        else setPostedPurchases(data || [])
    }, [onError])

    useEffect(() => {
        fetchPostedPurchases()
    }, [fetchPostedPurchases])

    const fetchPaymentMethods = useCallback(async () => {
        const { data, error } = await supabase
            .from('payment_methods')
            .select('code, name, is_active')
            .eq('is_active', true)
            .order('name', { ascending: true })
        if (!error && data) setPaymentMethods(data)
    }, [])

    useEffect(() => {
        fetchPaymentMethods()
    }, [fetchPaymentMethods])

    const ensurePurchaseInList = useCallback(async (purchaseId: string) => {
        const { data, error } = await supabase
            .from('purchases')
            .select('*, vendor:vendors(name)')
            .eq('id', purchaseId)
            .single()

        if (error || !data) return
        setPostedPurchases((prev) => {
            if (prev.some((row) => row.id === data.id)) return prev
            return [data, ...prev]
        })
    }, [])

    const fetchDraft = useCallback(async (returnId: string) => {
        setLoading(true)
        try {
            const { data: header, error: headerError } = await supabase
                .from('purchase_returns')
                .select('id, purchase_id, return_date, status, notes, payment_method_code')
                .eq('id', returnId)
                .single()
            if (headerError) throw headerError

            setSelectedPurchaseId(header.purchase_id)
            setDraftReturnDate(header.return_date)
            setNotes(header.notes || '')
            setPaymentMethodCode(header.payment_method_code || 'CASH')

            const { data: itemsData, error: itemsError } = await supabase
                .from('purchase_return_items')
                .select(`
                    item_id,
                    qty,
                    unit_cost,
                    uom_snapshot,
                    subtotal,
                    items (sku, name)
                `)
                .eq('purchase_return_id', returnId)
            if (itemsError) throw itemsError

            const loadedLines = itemsData?.map(item => ({
                item_id: item.item_id,
                sku: (item.items as unknown as { sku: string })?.sku || '',
                name: (item.items as unknown as { name: string })?.name || '',
                qty: item.qty,
                unit_cost: item.unit_cost,
                uom: item.uom_snapshot,
                subtotal: item.subtotal
            })) || []
            setLines(normalizeLines(loadedLines))
        } catch (err: unknown) {
            onError(getErrorMessage(err, 'Failed to load draft'))
        } finally {
            setLoading(false)
        }
    }, [onError])

    useEffect(() => {
        if (draftId) {
            fetchDraft(draftId)
        }
    }, [draftId, fetchDraft])

    useEffect(() => {
        if (initialPurchaseId) {
            setSelectedPurchaseId(initialPurchaseId)
            ensurePurchaseInList(initialPurchaseId)
            return
        }
        if (!purchaseParamId || draftId) return
        setSelectedPurchaseId(purchaseParamId)
        ensurePurchaseInList(purchaseParamId)
    }, [initialPurchaseId, purchaseParamId, draftId, ensurePurchaseInList])

    useEffect(() => {
        if (!selectedPurchaseId || isEditing) return
        const purchase = postedPurchases.find((p) => p.id === selectedPurchaseId)
        if (purchase?.terms === 'CASH') {
            setPaymentMethodCode(purchase.payment_method_code || 'CASH')
        } else {
            setPaymentMethodCode('CASH')
        }
    }, [selectedPurchaseId, postedPurchases, isEditing])

    const fetchPurchaseItems = useCallback(async (purchaseId: string) => {
        const { data, error } = await supabase
            .from('purchase_items')
            .select('*, item:items(sku, name)')
            .eq('purchase_id', purchaseId)

        if (error) onError(error.message)
        else setPurchaseItems(data || [])
    }, [onError])

    // Load items when Purchase Selected
    useEffect(() => {
        if (!selectedPurchaseId) {
            setPurchaseItems([])
            setLines([])
            return
        }
        fetchPurchaseItems(selectedPurchaseId)
    }, [selectedPurchaseId, fetchPurchaseItems])

    const normalizeLines = (source: ReturnItem[]) => {
        const map = new Map<string, ReturnItem>()
        source.forEach((line) => {
            const safeCost = line.unit_cost ?? 0
            const key = `${line.item_id}::${safeCost}::${line.uom}`
            const existing = map.get(key)
            if (existing) {
                map.set(key, {
                    ...existing,
                    qty: existing.qty + line.qty,
                    subtotal: existing.subtotal + line.subtotal,
                    unit_cost: safeCost
                })
            } else {
                map.set(key, { ...line, unit_cost: safeCost })
            }
        })
        return Array.from(map.values())
    }

    function handleAddItem(pItem: PurchaseItem, returnQty: number) {
        if (returnQty <= 0) return
        const safeCost = pItem.unit_cost ?? 0
        const existingQty = lines.find(l =>
            l.item_id === pItem.item_id &&
            l.unit_cost === safeCost &&
            l.uom === pItem.uom_snapshot
        )?.qty || 0
        const nextQty = existingQty + returnQty

        if (nextQty > pItem.qty) {
            void confirm({
                title: "Invalid Quantity",
                description: `Cannot return more than purchased qty (${pItem.qty})`,
                confirmText: "OK",
                hideCancel: true,
            })
            return
        }

        const existing = lines.find(l =>
            l.item_id === pItem.item_id &&
            l.unit_cost === pItem.unit_cost &&
            l.uom === pItem.uom_snapshot
        )
        if (existing) {
            const newLines = lines.map(l => {
                if (
                    l.item_id !== pItem.item_id ||
                    l.unit_cost !== safeCost ||
                    l.uom !== pItem.uom_snapshot
                ) return l
                return {
                    ...l,
                    qty: l.qty + returnQty,
                    subtotal: l.subtotal + (returnQty * safeCost)
                }
            })
            setLines(newLines)
        } else {
            setLines([...lines, {
                item_id: pItem.item_id,
                sku: pItem.item.sku,
                name: pItem.item.name,
                qty: returnQty,
                unit_cost: safeCost,
                uom: pItem.uom_snapshot,
                subtotal: returnQty * safeCost
            }])
        }
    }

    function removeLine(index: number) {
        setLines(lines.filter((_, i) => i !== index))
    }

    async function handleSaveDraft() {
        if (!selectedPurchaseId) return
        if (lines.length === 0) { onError("No items to return"); return }

        setLoading(true)

        try {
            const normalizedLines = normalizeLines(lines)
            const returnDate = draftReturnDate || new Date().toISOString().split('T')[0]
            const itemsPayload = normalizedLines.map(l => ({
                item_id: l.item_id,
                uom_snapshot: l.uom,
                qty: l.qty,
                unit_cost: l.unit_cost,
                subtotal: l.subtotal
            }))

            const { data, error } = await supabase.rpc('rpc_save_purchase_return_draft', {
                p_return_id: draftId,
                p_purchase_id: selectedPurchaseId,
                p_return_date: returnDate,
                p_payment_method_code: paymentMethodCode || 'CASH',
                p_notes: notes || null,
                p_items: itemsPayload
            })
            if (error) throw error

            const savedReturnId = (data as { return_id?: string } | null)?.return_id || draftId
            if (!savedReturnId) {
                throw new Error('Purchase return draft save did not return return id')
            }

            if (isEditing && draftId) {
                onSuccess(`Return Draft Updated: ${savedReturnId}`)
                queryClient.invalidateQueries({ queryKey: ["purchase-return-detail", savedReturnId] })
                queryClient.invalidateQueries({ queryKey: ["purchase-returns-history"] })
                queryClient.invalidateQueries({ queryKey: ["purchase-return-draft-count"] })
                onSaved?.(savedReturnId)
                if (!embedded) navigate(`/purchase-returns/${savedReturnId}`)
            } else {
                onSuccess(`Return Draft Created: ${savedReturnId}`)
                queryClient.invalidateQueries({ queryKey: ["purchase-return-detail", savedReturnId] })
                queryClient.invalidateQueries({ queryKey: ["purchase-returns-history"] })
                queryClient.invalidateQueries({ queryKey: ["purchase-return-draft-count"] })
                onSaved?.(savedReturnId)
                if (!embedded) navigate(`/purchase-returns/${savedReturnId}`)
            }

            setLines([])
            if (!isEditing) {
                setSelectedPurchaseId('')
            }
            if (!isEditing) {
                setPaymentMethodCode('CASH')
                setNotes('')
                setDraftReturnDate(null)
            }
        } catch (err: unknown) {
            onError(getErrorMessage(err))
        } finally {
            setLoading(false)
        }
    }

    const selectedPurchase = postedPurchases.find(p => p.id === selectedPurchaseId);

    return (
        <div className="space-y-4">
            {!embedded && (
                <div className="flex justify-between items-center">
                    <h2 className="hidden md:block text-3xl font-bold tracking-tight text-gray-900">Purchase Return</h2>
                    <div className="flex gap-2">
                        <Button onClick={() => navigate('/purchase-returns/history')} variant="outline" icon={<Icons.FileText className="w-4 h-4" />}>
                            Return History
                        </Button>
                    </div>
                </div>
            )}
            {!embedded && (
                <Card className="shadow-md border-gray-200">
                    <CardHeader className="bg-purple-50/50 pb-4 border-b border-purple-100">
                        <CardTitle className="text-purple-900 flex items-center gap-2">
                            <span className="flex items-center justify-center w-6 h-6 rounded-full bg-purple-100 text-purple-700 text-xs font-bold ring-1 ring-purple-200">1</span>
                            Select Original Purchase
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-6">
                        <Select
                            label="Purchase Bill Source"
                            value={selectedPurchaseId}
                            onChange={e => setSelectedPurchaseId(e.target.value)}
                            disabled={isEditing}
                            className="font-mono text-sm"
                            options={[
                                { label: "-- Select Purchase --", value: "" },
                                ...postedPurchases.map(s => ({
                                    label: `${s.purchase_date} • ${s.purchase_no || 'No Ref'} • ${s.vendor.name} • ${formatCurrency(s.total_amount)}`,
                                    value: s.id
                                }))
                            ]}
                        />
                    </CardContent>
                </Card>
            )}
            {embedded && (
                <div className="text-sm text-gray-600 bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 flex flex-wrap items-center gap-2">
                    <Icons.FileText className="w-4 h-4 text-slate-400 flex-shrink-0" />
                    {selectedPurchase ? (
                        <>
                            <span className="font-medium text-slate-800">{selectedPurchase.purchase_no || selectedPurchase.id.substring(0, 8)}</span>
                            <span className="text-slate-400">•</span>
                            <span className="truncate">{selectedPurchase.vendor.name}</span>
                            <span className="text-slate-400">•</span>
                            <span className="font-mono">{formatCurrency(selectedPurchase.total_amount)}</span>
                        </>
                    ) : (
                        <span className="text-slate-400 italic">Memuat data purchase...</span>
                    )}
                </div>
            )}

            {selectedPurchaseId && (
                <div className="grid grid-cols-1 lg:grid-cols-1 gap-6">
                    <Card className="shadow-sm border-gray-200">
                        <CardHeader className="bg-gray-50/50 pb-3 border-b border-gray-100 pt-4 px-4">
                            <CardTitle className="text-gray-800 text-sm flex items-center gap-2">
                                <span className="flex items-center justify-center w-5 h-5 rounded-full bg-gray-100 text-gray-600 text-[10px] font-bold ring-1 ring-gray-200">{embedded ? '1' : '2'}</span>
                                Return Details
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="pt-4 pb-4 px-4 space-y-3">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <Input
                                    label="Return Date"
                                    type="date"
                                    value={draftReturnDate || new Date().toISOString().split('T')[0]}
                                    onChange={(e) => setDraftReturnDate(e.target.value)}
                                    containerClassName="!mb-0"
                                />
                                <ButtonSelect
                                    label="Refund Method"
                                    value={paymentMethodCode}
                                    onChange={(val: string) => setPaymentMethodCode(val)}
                                    options={refundMethodOptions}
                                />
                            </div>
                            <Textarea
                                label="Notes"
                                placeholder="Reason / notes"
                                value={notes}
                                rows={2}
                                onChange={(e) => setNotes(e.target.value)}
                            />
                        </CardContent>
                    </Card>

                    <Card className="shadow-sm border-gray-200">
                        <CardHeader className="bg-gray-50/50 pb-3 border-b border-gray-100 pt-4 px-4">
                            <CardTitle className="text-gray-800 text-sm flex items-center gap-2">
                                <span className="flex items-center justify-center w-5 h-5 rounded-full bg-gray-100 text-gray-600 text-[10px] font-bold ring-1 ring-gray-200">{embedded ? '2' : '3'}</span>
                                Select Items to Return
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="pt-4 pb-4 px-4 space-y-4">

                            {/* Available Items */}
                            <div className="space-y-3">
                                <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Available Items from Bill</p>
                                <div className="space-y-3">
                                    {availableRows.length === 0 ? (
                                        <div className="p-6 text-center border rounded-lg bg-gray-50 text-gray-400 italic text-sm">
                                            No items found in this bill
                                        </div>
                                    ) : (
                                        availableRows.map((row) => (
                                            <div key={row.id} className="border border-gray-200 rounded-lg bg-white hover:border-purple-200 transition-colors">
                                                <div className="flex justify-between items-start p-3 pb-2">
                                                    <div>
                                                        <div className="font-medium text-gray-900 text-sm">{row.item.name}</div>
                                                        <div className="text-xs text-gray-500 font-mono">{row.item.sku}</div>
                                                    </div>
                                                    <div className="flex gap-4 text-right ml-4 flex-shrink-0">
                                                        <div>
                                                            <div className="text-[10px] text-gray-400 uppercase">Qty</div>
                                                            <div className="text-sm font-mono font-medium">{row.qty} {row.uom_snapshot}</div>
                                                        </div>
                                                        <div>
                                                            <div className="text-[10px] text-gray-400 uppercase">Cost</div>
                                                            <div className="text-sm font-mono font-medium">{formatCurrency(row.unit_cost)}</div>
                                                        </div>
                                                    </div>
                                                </div>
                                <div className="px-3 pb-3 flex items-end gap-2 min-w-0">
                                    <div className="flex-1 min-w-0">
                                        <Input
                                            id={row._inputId}
                                            label="Return Qty"
                                            type="number"
                                            defaultValue=""
                                            placeholder="0"
                                            min={0}
                                            max={row.qty}
                                            containerClassName="!mb-0"
                                            onKeyDown={(e) => {
                                                if (e.key === "Enter") {
                                                    e.preventDefault();
                                                    const raw = (e.target as HTMLInputElement).value;
                                                    const val = raw === "" ? 0 : parseFloat(raw);
                                                    handleAddItem(row, val);
                                                    (e.target as HTMLInputElement).value = "";
                                                }
                                            }}
                                        />
                                    </div>
                                    <Button
                                        variant="outline"
                                        className="h-10 px-3 flex-shrink-0 whitespace-nowrap hover:bg-purple-100 hover:text-purple-700 hover:border-purple-300 transition-all"
                                        onClick={() => {
                                            const inputEl = document.getElementById(row._inputId) as HTMLInputElement;
                                            const val = inputEl.value === "" ? 0 : parseFloat(inputEl.value);
                                            handleAddItem(row, val);
                                            inputEl.value = "";
                                        }}
                                    >
                                        Add
                                    </Button>
                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>

                            {lines.length > 0 && <Separator />}

                            {/* Draft Preview */}
                            {lines.length > 0 && (
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between">
                                        <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-2">
                                            Return Draft
                                            <span className="bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full text-[10px]">{lines.length}</span>
                                        </p>
                                        <div className="text-sm font-bold text-gray-900 bg-green-50 px-3 py-1 rounded-md border border-green-200">
                                            Total: {formatCurrency(linesTotal)}
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        {lines.map((line, index) => (
                                            <div key={index} className="flex items-center gap-3 p-3 border border-purple-100 bg-purple-50/30 rounded-lg">
                                                <div className="flex-1 min-w-0">
                                                    <div className="font-medium text-gray-900 text-sm truncate">{line.name}</div>
                                                    <div className="text-xs text-gray-500 font-mono">{line.sku}</div>
                                                    <div className="text-xs text-gray-600 mt-0.5">
                                                        {formatCurrency(line.unit_cost)} × {line.qty} {line.uom}
                                                    </div>
                                                </div>
                                                <div className="text-right flex-shrink-0">
                                                    <div className="font-mono font-bold text-purple-700 text-sm">{formatCurrency(line.subtotal)}</div>
                                                </div>
                                                <button
                                                    onClick={() => removeLine(index)}
                                                    className="text-gray-400 hover:text-red-600 transition-colors p-1.5 flex-shrink-0 hover:bg-red-50 rounded"
                                                    title="Remove"
                                                >
                                                    <Icons.Trash className="w-4 h-4" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div className="flex justify-end gap-3 pt-2">
                                {embedded && (
                                    <Button
                                        onClick={onCancel}
                                        variant="outline"
                                        disabled={loading}
                                        className="min-w-[100px]"
                                    >
                                        Batal
                                    </Button>
                                )}
                                <Button
                                    onClick={handleSaveDraft}
                                    disabled={loading || lines.length === 0}
                                    className="min-w-[140px] bg-purple-600 hover:bg-purple-700 shadow-sm"
                                    isLoading={loading}
                                >
                                    Save Return Draft
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}
        </div>
    );
}
