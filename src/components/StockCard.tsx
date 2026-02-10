import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from "../supabaseClient";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/Table'
import { Badge } from './ui/Badge'
import { Icons } from './ui/Icons'
import { Input } from './ui/Input'
import { Section } from './ui/Section'
import { Card, CardHeader, CardTitle } from './ui/Card'
import { usePagination } from '../hooks/usePagination'
import { Pagination } from './ui/Pagination'
import { Button } from './ui/Button'

interface DisplayItem {
    id?: string
    trx_date: string;
    trx_type: string;
    ref_no: string;
    qty_in: number;
    qty_out: number;
    balance?: number;
    // Global
    item_name?: string;
    sku?: string;
    size_name?: string;
    color_name?: string;
}

type StockCardRow = {
    trx_date: string
    trx_type: string
    ref_no: string
    qty_change: number
    item_name?: string | null
    sku?: string | null
    size_name?: string | null
    color_name?: string | null
    item_id?: string
    created_at?: string
}

export default function StockCard({ itemId }: { itemId?: string | null }) {
    const [loading, setLoading] = useState(false)
    const [allItems, setAllItems] = useState<DisplayItem[]>([]) // For client-side pagination (ItemCard)
    const [itemName, setItemName] = useState("")
    const [totalCount, setTotalCount] = useState(0)
    const [hasOpeningStock, setHasOpeningStock] = useState(false)
    const navigate = useNavigate()

    const { page, setPage, pageSize, range, reset: resetPage } = usePagination({ defaultPageSize: 20 });
    const [rangeStart, rangeEnd] = range;

    // Date Filter for Specific Item
    const [startDate, setStartDate] = useState(() => {
        const d = new Date(); d.setDate(1);
        return d.toISOString().split('T')[0]
    })
    const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0])

    const [globalFeed, setGlobalFeed] = useState<DisplayItem[]>([])

    // Derived state for display
    const visibleRows = itemId
        ? allItems.slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize)
        : globalFeed;

    const fetchGlobalFeed = useCallback(async () => {
        setLoading(true)
        const { data, error, count } = await supabase
            .from('view_stock_card')
            .select('*', { count: 'exact' })
            .order('created_at', { ascending: false })
            .range(rangeStart, rangeEnd)

        if (!error && data) {
            const mapped: DisplayItem[] = (data as StockCardRow[]).map((m) => ({
                trx_date: m.trx_date,
                trx_type: m.trx_type,
                ref_no: m.ref_no,
                qty_in: m.qty_change > 0 ? m.qty_change : 0,
                qty_out: m.qty_change < 0 ? Math.abs(m.qty_change) : 0,
                item_name: m.item_name || undefined,
                sku: m.sku || undefined,
                size_name: m.size_name || undefined,
                color_name: m.color_name || undefined
            }))
            setGlobalFeed(mapped)
            setTotalCount(count || 0)
        } else {
            setGlobalFeed([])
            setTotalCount(0)
        }
        setLoading(false)
    }, [rangeStart, rangeEnd])

    const fetchItemCard = useCallback(async () => {
        if (!itemId) return
        setLoading(true)

        // Get Item Name
        const { data: itemData } = await supabase.from('items').select('name').eq('id', itemId).single()
        if (itemData) setItemName(itemData.name)

        // 1. Opening
        const { data: openData } = await supabase.from('view_stock_card')
            .select('qty_change')
            .eq('item_id', itemId)
            .eq('trx_type', 'OPENING')
            .lt('trx_date', startDate)

        const openingQty = (openData as StockCardRow[] | null | undefined)
            ?.reduce((sum, row) => sum + row.qty_change, 0) || 0

        // 2. Movements
        const { data: movData } = await supabase.from('view_stock_card')
            .select('*')
            .eq('item_id', itemId)
            .gte('trx_date', startDate)
            .lte('trx_date', endDate)
            .order('trx_date', { ascending: true })
            .order('created_at', { ascending: true })

        if (movData) {
            let running = openingQty
            const res: DisplayItem[] = []

            const hasOpeningInRange = (movData as StockCardRow[]).some((m) => m.trx_type === 'OPENING')
            if (openingQty !== 0 && !hasOpeningInRange) {
                res.push({
                    trx_date: startDate,
                    trx_type: 'OPENING',
                    ref_no: '-',
                    qty_in: 0,
                    qty_out: 0,
                    balance: openingQty
                })
            }

            ; (movData as StockCardRow[]).forEach((m) => {
                running += m.qty_change
                res.push({
                    trx_date: m.trx_date,
                    trx_type: m.trx_type,
                    ref_no: m.ref_no,
                    qty_in: m.qty_change > 0 ? m.qty_change : 0,
                    qty_out: m.qty_change < 0 ? Math.abs(m.qty_change) : 0,
                    balance: running
                })
            })
            setAllItems(res)
            setTotalCount(res.length)
        } else {
            setAllItems([])
            setTotalCount(0)
        }
        setLoading(false)
    }, [itemId, startDate, endDate])

    // Reset page when switching modes or items
    useEffect(() => {
        resetPage();
    }, [itemId, resetPage]);

    // Reset page when date range changes (item view)
    useEffect(() => {
        if (itemId) {
            resetPage()
        }
    }, [itemId, startDate, endDate, resetPage])

    // Effect to fetch Global Feed when !itemId
    useEffect(() => {
        if (!itemId) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            void fetchGlobalFeed();
        }
    }, [itemId, fetchGlobalFeed]);

    // Effect to fetch Item Card when itemId changes
    useEffect(() => {
        if (itemId) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            void fetchItemCard();

            // Check existing opening stock
            const checkOpening = async () => {
                const { count } = await supabase
                    .from('inventory_adjustments')
                    .select('id', { count: 'exact', head: true })
                    .eq('item_id', itemId)
                    .or('reason.ilike.Opening%,reason.ilike.%Import Initial Stock%')

                setHasOpeningStock((count || 0) > 0)
            }
            void checkOpening()
        } else {
            setHasOpeningStock(false)
        }
    }, [itemId, fetchItemCard]);


    return (
        <div className="space-y-6 h-full">
            {/* Filter Section (Only for Specific Item) */}
            {itemId && (
                <Section
                    title="Filter Period"
                    description={`Viewing history for ${itemName || '...'}`}
                    className="border-l-4 border-l-indigo-500"
                >
                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-end">
                        <div className="col-span-6 sm:col-span-4 lg:col-span-3">
                            <Input
                                label="From"
                                type="date"
                                value={startDate}
                                onChange={e => setStartDate(e.target.value)}
                                containerClassName="!mb-0"
                            />
                        </div>
                        <div className="col-span-6 sm:col-span-4 lg:col-span-3">
                            <Input
                                label="To"
                                type="date"
                                value={endDate}
                                onChange={e => setEndDate(e.target.value)}
                                containerClassName="!mb-0"
                            />
                        </div>
                        <div className="col-span-12 sm:col-span-4 lg:col-span-2">
                            <Button
                                variant="outline"
                                className="w-full"
                                onClick={() => {
                                    const d = new Date(); d.setDate(1);
                                    setStartDate(d.toISOString().split('T')[0]);
                                    setEndDate(new Date().toISOString().split('T')[0]);
                                }}
                                icon={<Icons.RotateCcw className="w-4 h-4" />}
                            >
                                Reset
                            </Button>
                        </div>
                    </div>
                </Section>
            )}

            {/* Results Card */}
            <Card className="h-full shadow-sm hover:shadow-md transition-shadow duration-200">
                <CardHeader className="pb-2 border-b border-gray-100 bg-gray-50/50">
                    <CardTitle className="text-lg flex justify-between items-center">
                        <div className="flex items-center gap-2">
                            {itemId ? (
                                <>
                                    <Icons.History className="w-5 h-5 text-indigo-500" />
                                    <span>Stock Card History</span>
                                </>
                            ) : (
                                <>
                                    <Icons.Activity className="w-5 h-5 text-blue-500" />
                                    <span>Recent Activity (Global)</span>
                                </>
                            )}
                        </div>
                        {itemId && !hasOpeningStock && (
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={() => navigate('/opening-stock', { state: { itemId } })}
                                icon={<Icons.Plus className="w-4 h-4" />}
                                className="bg-white hover:bg-slate-50 text-indigo-600 border-indigo-200"
                            >
                                Set Opening Stock
                            </Button>
                        )}
                    </CardTitle>
                    {!itemId && (
                        <p className="text-xs text-slate-500 font-normal pl-7">
                            Monitor all stock movements across the system in real-time.
                        </p>
                    )}
                </CardHeader>
                <div className="flex-1 overflow-y-auto">
                    <Table>
                        <TableHeader className="bg-white sticky top-0 z-30 shadow-sm">
                            <TableRow>
                                <TableHead className="w-24 text-xs uppercase tracking-wider text-slate-500">Date</TableHead>
                                {!itemId && <TableHead className="text-xs uppercase tracking-wider text-slate-500">Item</TableHead>}
                                <TableHead className="text-xs uppercase tracking-wider text-slate-500">Type / Ref</TableHead>
                                <TableHead className="text-right text-xs uppercase tracking-wider text-green-700">In</TableHead>
                                <TableHead className="text-right text-xs uppercase tracking-wider text-red-700">Out</TableHead>
                                {itemId && <TableHead className="text-right text-xs uppercase tracking-wider text-slate-700 font-bold">Balance</TableHead>}
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? (
                                <TableRow><TableCell colSpan={6} className="text-center py-10 text-slate-500">
                                    <div className="flex justify-center items-center gap-2">
                                        <div className="animate-spin w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full"></div>
                                        <span>Loading history...</span>
                                    </div>
                                </TableCell></TableRow>
                            ) : visibleRows.length === 0 ? (
                                <TableRow><TableCell colSpan={6} className="text-center py-12 text-slate-400 italic">No movements recorded in this period.</TableCell></TableRow>
                            ) : (
                                visibleRows.map((row, idx) => (
                                    <TableRow key={idx} className="hover:bg-slate-50 transition-colors border-b border-slate-50">
                                        <TableCell className="text-xs font-mono text-slate-600">{row.trx_date}</TableCell>
                                        {!itemId && (
                                            <TableCell>
                                                <div className="font-medium text-xs text-slate-900">{row.item_name}</div>
                                                <div className="flex items-center gap-2 mt-0.5">
                                                    <div className="text-[10px] text-slate-500 font-mono">{row.sku}</div>
                                                    {(row.size_name || row.color_name) && (
                                                        <div className="flex gap-1">
                                                            {row.size_name && <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 border-slate-200 text-slate-600 bg-slate-50">{row.size_name}</Badge>}
                                                            {row.color_name && <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 border-slate-200 text-slate-600 bg-slate-50">{row.color_name}</Badge>}
                                                        </div>
                                                    )}
                                                </div>
                                            </TableCell>
                                        )}
                                        <TableCell>
                                            <Badge variant="outline" className="text-[10px] mb-1 px-1.5 py-0 border-slate-200 text-slate-600 bg-slate-50">{row.trx_type}</Badge>
                                            <div className="text-[10px] text-slate-400 truncate max-w-[120px] font-mono" title={row.ref_no}>{row.ref_no}</div>
                                        </TableCell>
                                        <TableCell className="text-right text-xs text-emerald-600 font-medium bg-emerald-50/30">
                                            {row.qty_in > 0 ? `+${row.qty_in}` : '-'}
                                        </TableCell>
                                        <TableCell className="text-right text-xs text-rose-600 font-medium bg-rose-50/30">
                                            {row.qty_out > 0 ? `-${row.qty_out}` : '-'}
                                        </TableCell>
                                        {itemId && (
                                            <TableCell className="text-right text-xs font-bold text-slate-700 bg-slate-50/80">
                                                {row.balance?.toLocaleString()}
                                            </TableCell>
                                        )}
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </div>
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
        </div >
    )
}
