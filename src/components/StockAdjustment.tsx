import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../supabaseClient'
import { Card, CardContent, CardHeader, CardTitle } from './ui/Card'
import { Button } from './ui/Button'
import { Input } from './ui/Input'
import { Combobox } from './ui/Combobox'
import { Textarea } from './ui/Textarea'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/Table'
import { Icons } from './ui/Icons'
import OpeningStock from './OpeningStock'
import { usePagination } from '../hooks/usePagination'
import { Pagination } from './ui/Pagination'
import { PageHeader } from './ui/PageHeader'
import { Section } from './ui/Section'
import { getErrorMessage } from '../lib/errors'

// --- TYPES ---
type Item = { id: string; name: string; sku: string; size_name?: string; color_name?: string }

type AdjustmentHistory = {
    id: string
    adjusted_at: string
    qty_delta: number
    reason: string
    item_id: string
    item: {
        name: string
        sku: string
    }
}

type FormProps = {
    initialItemId?: string
    initialItemName?: string
    onSuccess?: () => void
    onCancel?: () => void
    isEmbedded?: boolean
}

// --- SUB-COMPONENT: FORM ---
function StockAdjustmentForm({
    initialItemId,
    initialItemName,
    onSuccess,
    onCancel,
    isEmbedded = false
}: FormProps) {
    const [items, setItems] = useState<Item[]>([])
    const [itemId, setItemId] = useState(initialItemId || '')
    const [delta, setDelta] = useState(0)
    const [reason, setReason] = useState('')

    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState<string | null>(null)
    const [notice, setNotice] = useState<string | null>(null)
    const [requireCloseAck, setRequireCloseAck] = useState(false)

    useEffect(() => {
        if (!initialItemId) fetchItems()
    }, [initialItemId])

    useEffect(() => {
        if (initialItemId) setItemId(initialItemId)
    }, [initialItemId])

    async function fetchItems() {
        const { data } = await supabase.from('items').select('id, name, sku, sizes(name), colors(name)').order('name')

        const mappedItems = (data || []).map((item: {
            id: string;
            name: string;
            sku: string;
            sizes: unknown;
            colors: unknown;
        }) => ({
            id: item.id,
            name: item.name,
            sku: item.sku,
            size_name: (item.sizes as { name: string } | null)?.name,
            color_name: (item.colors as { name: string } | null)?.name,
        }));

        setItems(mappedItems)
    }

    async function handleSubmit() {
        if (!itemId) { setError("Select Item"); return }
        if (delta === 0) { setError("Delta cannot be 0"); return }
        if (reason.trim().length === 0) { setError("Reason required"); return }

        setLoading(true)
        setError(null)
        setSuccess(null)
        setNotice(null)
        setRequireCloseAck(false)

        try {
            const { data, error } = await supabase.rpc('rpc_adjust_stock', {
                p_item_id: itemId,
                p_qty_delta: delta,
                p_reason: reason
            })

            if (error) throw error

            const msg = "Adjustment Saved Successfully!"
            setSuccess(msg)
            const journalSkipped =
                (data as { journal_skipped?: boolean } | null | undefined)?.journal_skipped ??
                (Array.isArray(data) ? (data[0] as { journal_skipped?: boolean } | undefined)?.journal_skipped : undefined)
            if (journalSkipped) {
                setNotice("Journal skipped (cost 0). Set purchase price/avg cost if you need accounting impact.")
                if (onSuccess) {
                    setRequireCloseAck(true)
                }
            }
            setDelta(0)
            setReason('')

            // If onSuccess is provided, call it. Otherwise, clear form for new entry.
            if (onSuccess) {
                if (!journalSkipped) {
                    onSuccess()
                }
            } else {
                if (!initialItemId) setItemId('')
                setSuccess(null) // Clear success immediately if we are staying on generic form
            }
        } catch (err: unknown) {
            setError(getErrorMessage(err))
        } finally {
            setLoading(false)
        }
    }

    const content = (
        <div className="space-y-6 pt-2">
            {error && <div className="p-3 bg-red-100 text-red-700 rounded-md text-sm font-medium">{error}</div>}
            {success && <div className="p-3 bg-green-100 text-green-700 rounded-md text-sm font-medium">{success}</div>}
            {notice && <div className="p-3 bg-amber-50 text-amber-700 rounded-md text-sm font-medium">{notice}</div>}

            <div className="space-y-4">
                {initialItemId ? (
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Item</label>
                        <Input value={initialItemName || itemId} disabled className="bg-gray-100" />
                    </div>
                ) : (
                    <div className="flex flex-col gap-1.5 mb-3">
                        <Combobox
                            label="Item"
                            value={itemId}
                            onChange={setItemId}
                            placeholder="-- Select Item --"
                            searchPlaceholder="Search Item..."
                            options={items.map(i => {
                                const variantLabel = [i.size_name, i.color_name].filter(Boolean).join(", ");
                                return {
                                    label: `${i.sku} - ${i.name}${variantLabel ? ` (${variantLabel})` : ''}`,
                                    value: i.id
                                };
                            })}
                        />
                    </div>
                )}

                <div>
                    <Input
                        label="Qty Change (+/-)"
                        type="number"
                        inputMode="numeric"
                        step="1"
                        value={delta === 0 ? "" : delta}
                        onFocus={(e) => e.target.select()}
                        onChange={e => {
                            const val = e.target.value;
                            setDelta(val === "" ? 0 : parseFloat(val));
                        }}
                        placeholder="e.g. 5 or -2"
                    />
                    <p className="text-xs text-gray-500 mt-1">Positive = Gain (Found), Negative = Loss (Damaged)</p>
                </div>

                <Textarea
                    label="Reason"
                    value={reason}
                    onChange={e => setReason(e.target.value)}
                    placeholder="Wajib diisi (misal: Stock Opname, Barang Rusak)"
                    rows={3}
                />

                <div className="flex gap-3 justify-end pt-4">
                    {onCancel && (
                        <Button variant="outline" onClick={onCancel} disabled={loading}>
                            Cancel
                        </Button>
                    )}
                    {requireCloseAck && onSuccess ? (
                        <Button
                            onClick={onSuccess}
                            className={isEmbedded ? "w-auto" : "w-full"}
                        >
                            Close
                        </Button>
                    ) : (
                        <Button
                            onClick={handleSubmit}
                            disabled={loading}
                            isLoading={loading}
                            className={isEmbedded ? "w-auto" : "w-full"}
                        >
                            Confirm Adjustment
                        </Button>
                    )}
                </div>
            </div>
        </div>
    )

    if (isEmbedded) {
        return content
    }

    return (
        <div className="w-full">
            <Card className="shadow-lg border-gray-200">
                <CardHeader className="bg-orange-50 border-b border-orange-100 pb-4">
                    <CardTitle className="text-xl text-orange-800">New Adjustment</CardTitle>
                </CardHeader>
                <CardContent>
                    {content}
                </CardContent>
            </Card>
        </div>
    )
}

// --- MAIN COMPONENT: PAGE & ORCHESTRATOR ---
export default function StockAdjustment(props: FormProps) {
    // 1. EMBEDDED MODE (Direct Form)
    if (props.isEmbedded) {
        return <StockAdjustmentForm {...props} />
    }

    // 2. PAGE MODE (History + Dialog)
    return <StockAdjustmentPage />
}

function StockAdjustmentPage() {
    const [history, setHistory] = useState<AdjustmentHistory[]>([])
    const [loading, setLoading] = useState(true)
    const [showForm, setShowForm] = useState(false)
    const [showOpeningForm, setShowOpeningForm] = useState(false)
    const [refreshTrigger, setRefreshTrigger] = useState(0)

    const { page, setPage, pageSize, range } = usePagination({ defaultPageSize: 20 });
    const [totalCount, setTotalCount] = useState(0);

    const [rangeStart, rangeEnd] = range;

    const fetchHistory = useCallback(async () => {
        setLoading(true)
        const { data, error, count } = await supabase
            .from('inventory_adjustments')
            .select(`
                id, adjusted_at, qty_delta, reason, item_id,
                item:items (name, sku)
            `, { count: 'exact' })
            .order('adjusted_at', { ascending: false })
            .range(rangeStart, rangeEnd)

        if (!error && data) {
            // @ts-expect-error: Supabase returns typed rows without strict inference here.
            setHistory(data)
            setTotalCount(count || 0)
        }
        setLoading(false)
    }, [rangeStart, rangeEnd])

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        fetchHistory()
    }, [fetchHistory, refreshTrigger])


    function handleFormSuccess() {
        setShowForm(false)
        setShowOpeningForm(false)
        setRefreshTrigger(p => p + 1)
    }

    return (
        <div className="space-y-6">
            <PageHeader
                title="Stock Adjustment History"
                description="Log penyesuaian stok manual (Opname / Rusak / Hilang)"
                actions={
                    <div className="flex gap-2">
                        <Button variant="outline" onClick={() => setShowOpeningForm(true)} icon={<Icons.Package className="w-4 h-4" />}>
                            Set Opening Stock
                        </Button>
                        <Button onClick={() => setShowForm(true)} icon={<Icons.Plus className="w-4 h-4" />}>
                            New Adjustment
                        </Button>
                    </div>
                }
            />

            {/* HISTORY LIST */}
            <Section title="History">
                <Card className="shadow-md border-gray-200">
                    <CardContent className="p-0 overflow-hidden">
                        <Table>
                            <TableHeader className="bg-gray-50">
                                <TableRow>
                                    <TableHead>Date</TableHead>
                                    <TableHead>Item (SKU)</TableHead>
                                    <TableHead className="text-right">Qty Delta</TableHead>
                                    <TableHead>Reason</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {loading ? (
                                    <TableRow>
                                        <TableCell colSpan={4} className="h-24 text-center">Loading...</TableCell>
                                    </TableRow>
                                ) : history.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={4} className="h-24 text-center text-gray-500 italic">
                                            No adjustments found
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    history.map(h => (
                                        <TableRow key={h.id}>
                                            <TableCell className="whitespace-nowrap">
                                                {new Date(h.adjusted_at).toLocaleDateString()}{" "}
                                                <span className="text-xs text-gray-400">
                                                    {new Date(h.adjusted_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                </span>
                                            </TableCell>
                                            <TableCell>
                                                <div className="font-medium">{h.item?.name || 'Unknown'}</div>
                                                <div className="text-xs text-gray-500">{h.item?.sku}</div>
                                            </TableCell>
                                            <TableCell className={`text-right font-bold ${h.qty_delta > 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                {h.qty_delta > 0 ? '+' : ''}{h.qty_delta}
                                            </TableCell>
                                            <TableCell className="max-w-xs truncate">
                                                <div title={h.reason} className="truncate text-gray-600">
                                                    {h.reason}
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </CardContent>
                    <div className="border-t border-gray-100 p-2">
                        <Pagination
                            currentPage={page}
                            totalCount={totalCount}
                            pageSize={pageSize}
                            onPageChange={setPage}
                            isLoading={loading}
                        />
                    </div>
                </Card>
            </Section>

            {/* ADD ADJUSTMENT DIALOG */}
            {showForm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white rounded-lg shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="bg-orange-50 px-6 py-4 border-b border-orange-100 flex justify-between items-center">
                            <h3 className="font-bold text-orange-900 flex items-center gap-2">
                                <Icons.Edit className="w-5 h-5" />
                                New Stock Adjustment
                            </h3>
                            <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600">
                                <Icons.Close className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-6">
                            <StockAdjustmentForm
                                isEmbedded={true}
                                onSuccess={handleFormSuccess}
                                onCancel={() => setShowForm(false)}
                            />
                        </div>
                    </div>
                </div>
            )}

            {/* OPENING STOCK DIALOG */}
            {showOpeningForm && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white rounded-lg shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="bg-blue-50 px-6 py-4 border-b border-blue-100 flex justify-between items-center">
                            <h3 className="font-bold text-blue-900 flex items-center gap-2">
                                <Icons.Package className="w-5 h-5" />
                                Set Opening Stock (Awal)
                            </h3>
                            <button onClick={() => setShowOpeningForm(false)} className="text-gray-400 hover:text-gray-600">
                                <Icons.Close className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-6">
                            <OpeningStock
                                isEmbedded={true}
                                onSuccess={handleFormSuccess}
                            />
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
