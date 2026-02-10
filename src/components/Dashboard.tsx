import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../supabaseClient'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from './ui/Card'
import { Button } from './ui/Button'
import { Icons } from './ui/Icons'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/Table'
import { StatusBadge } from './ui/StatusBadge'
import { formatCurrency, safeDocNo } from '../lib/format'
import { PageHeader } from './ui/PageHeader'
import { Section } from './ui/Section'
import { Badge } from './ui/Badge'

type DashboardMetrics = {
    sales_today: number
    sales_month: number
    sales_count_today: number
    purchases_month: number
    purchases_count_month: number
    low_stock_count: number
    total_items: number
    // Finance Health
    total_ar: number
    total_ap: number
    cash_balance: number
    top_items?: {
        item_name: string
        total_qty: number
        total_amount: number
    }[]
    // Stale Drafts
    stale_draft_sales: number
    stale_draft_purchases: number
    recent_sales: {
        id: string
        sales_no: string
        customer_name: string
        total_amount: number
        status: string
    }[]
    recent_purchases: {
        id: string
        purchase_no: string
        vendor_name: string
        total_amount: number
        status: string
    }[]
}

type PeriodInfo = {
    id: string
    name: string
    start_date: string
    end_date: string
    status: 'OPEN' | 'CLOSED'
}

type AgingBuckets = {
    bucket_0_30: number
    bucket_31_60: number
    bucket_61_plus: number
}

type TrendPoint = {
    date: string
    total: number
}

type StockTrendPoint = {
    date: string
    qty_in: number
    qty_out: number
}

export default function Dashboard({ isOwner }: { isOwner: boolean }) {
    const navigate = useNavigate()
    const [metrics, setMetrics] = useState<DashboardMetrics | null>(null)
    const [loading, setLoading] = useState(true)
    const [refreshTrigger, setRefreshTrigger] = useState(0)
    const [periodInfo, setPeriodInfo] = useState<PeriodInfo | null>(null)
    const [arAging, setArAging] = useState<AgingBuckets | null>(null)
    const [apAging, setApAging] = useState<AgingBuckets | null>(null)
    const [salesTrend, setSalesTrend] = useState<TrendPoint[]>([])
    const [purchaseTrend, setPurchaseTrend] = useState<TrendPoint[]>([])
    const [stockTrend, setStockTrend] = useState<StockTrendPoint[]>([])
    const [trendLoading, setTrendLoading] = useState(false)
    const [trendRangeDays, setTrendRangeDays] = useState(14)
    const [hoveredSalesIndex, setHoveredSalesIndex] = useState<number | null>(null)
    const [hoveredPurchaseIndex, setHoveredPurchaseIndex] = useState<number | null>(null)
    const [hoveredStockIndex, setHoveredStockIndex] = useState<number | null>(null)

    const fetchMetrics = useCallback(async () => {
        setLoading(true)
        try {
            const { data, error } = await supabase.rpc('rpc_get_dashboard_metrics')
            if (error) throw error
            setMetrics(data)
        } catch (error) {
            console.error('Error fetching metrics:', error)
        } finally {
            setLoading(false)
        }
    }, [])

    const fetchPeriodStatus = useCallback(async () => {
        try {
            const { data, error } = await supabase
                .from('accounting_periods')
                .select('id, name, start_date, end_date, status')
                .order('end_date', { ascending: false })
                .limit(1)
                .maybeSingle()
            if (error) throw error
            if (data) setPeriodInfo(data as PeriodInfo)
        } catch (error) {
            console.error('Error fetching period status:', error)
        }
    }, [])

    const computeAgingBuckets = useCallback((rows: { date: string; outstanding: number }[]) => {
        const buckets: AgingBuckets = { bucket_0_30: 0, bucket_31_60: 0, bucket_61_plus: 0 }
        const now = new Date()
        rows.forEach((row) => {
            const d = new Date(row.date)
            const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24))
            if (diffDays <= 30) buckets.bucket_0_30 += row.outstanding
            else if (diffDays <= 60) buckets.bucket_31_60 += row.outstanding
            else buckets.bucket_61_plus += row.outstanding
        })
        return buckets
    }, [])

    const fetchAgingSummary = useCallback(async () => {
        try {
            const { data: arRows, error: arError } = await supabase
                .from('ar_invoices')
                .select('invoice_date, outstanding_amount, status')
                .neq('status', 'PAID')
            if (arError) throw arError
            const arClean = (arRows || [])
                .filter(r => (r.outstanding_amount || 0) > 0 && r.invoice_date)
                .map(r => ({ date: r.invoice_date as string, outstanding: Number(r.outstanding_amount || 0) }))
            setArAging(computeAgingBuckets(arClean))

            const { data: apRows, error: apError } = await supabase
                .from('ap_bills')
                .select('bill_date, outstanding_amount, status')
                .neq('status', 'PAID')
            if (apError) throw apError
            const apClean = (apRows || [])
                .filter(r => (r.outstanding_amount || 0) > 0 && r.bill_date)
                .map(r => ({ date: r.bill_date as string, outstanding: Number(r.outstanding_amount || 0) }))
            setApAging(computeAgingBuckets(apClean))
        } catch (error) {
            console.error('Error fetching aging summary:', error)
        }
    }, [computeAgingBuckets])

    const fetchTrends = useCallback(async () => {
        const buildDateRange = (days: number) => {
            const today = new Date()
            const dates: string[] = []
            for (let i = days - 1; i >= 0; i -= 1) {
                const d = new Date(today)
                d.setDate(today.getDate() - i)
                dates.push(d.toISOString().split('T')[0])
            }
            return dates
        }

        const range = buildDateRange(trendRangeDays)
        const startDate = range[0]
        setTrendLoading(true)

        try {
            const [salesRes, purchaseRes, stockRes] = await Promise.all([
                supabase
                    .from('sales')
                    .select('sales_date,total_amount')
                    .eq('status', 'POSTED')
                    .gte('sales_date', startDate),
                supabase
                    .from('purchases')
                    .select('purchase_date,total_amount')
                    .eq('status', 'POSTED')
                    .gte('purchase_date', startDate),
                supabase
                    .from('view_stock_card')
                    .select('trx_date,qty_change')
                    .gte('trx_date', startDate)
            ])

            if (salesRes.error) throw salesRes.error
            if (purchaseRes.error) throw purchaseRes.error
            if (stockRes.error) throw stockRes.error

            const salesMap = new Map<string, number>()
                ; (salesRes.data || []).forEach(row => {
                    if (!row.sales_date) return
                    const d = row.sales_date as string
                    salesMap.set(d, (salesMap.get(d) || 0) + Number(row.total_amount || 0))
                })
            const purchaseMap = new Map<string, number>()
                ; (purchaseRes.data || []).forEach(row => {
                    if (!row.purchase_date) return
                    const d = row.purchase_date as string
                    purchaseMap.set(d, (purchaseMap.get(d) || 0) + Number(row.total_amount || 0))
                })

            const stockMap = new Map<string, { qty_in: number; qty_out: number }>()
                ; (stockRes.data || []).forEach(row => {
                    if (!row.trx_date) return
                    const d = (row.trx_date as string)
                    const entry = stockMap.get(d) || { qty_in: 0, qty_out: 0 }
                    const change = Number(row.qty_change || 0)
                    if (change >= 0) entry.qty_in += change
                    else entry.qty_out += Math.abs(change)
                    stockMap.set(d, entry)
                })

            setSalesTrend(range.map(date => ({ date, total: salesMap.get(date) || 0 })))
            setPurchaseTrend(range.map(date => ({ date, total: purchaseMap.get(date) || 0 })))
            setStockTrend(range.map(date => ({
                date,
                qty_in: stockMap.get(date)?.qty_in || 0,
                qty_out: stockMap.get(date)?.qty_out || 0
            })))
        } catch (error) {
            console.error('Error fetching trends:', error)
            setSalesTrend([])
            setPurchaseTrend([])
            setStockTrend([])
        } finally {
            setTrendLoading(false)
        }
    }, [trendRangeDays])

    useEffect(() => {
        fetchMetrics()
        if (isOwner) {
            fetchPeriodStatus()
            fetchAgingSummary()
        } else {
            setPeriodInfo(null)
            setArAging(null)
            setApAging(null)
        }
        fetchTrends()
    }, [fetchMetrics, fetchPeriodStatus, fetchAgingSummary, fetchTrends, refreshTrigger, isOwner])

    const currentDate = new Date().toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    })

    if (loading && !metrics) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4 animate-in fade-in duration-500">
                <div className="relative">
                    <div className="w-12 h-12 border-4 border-indigo-100 rounded-full animate-spin border-t-indigo-600"></div>
                    <div className="absolute inset-0 flex items-center justify-center">
                        <Icons.Activity className="w-4 h-4 text-indigo-600" />
                    </div>
                </div>
                <p className="text-slate-500 font-medium text-sm">Gathering insights...</p>
            </div>
        )
    }

    const hasStaleSales = (metrics?.stale_draft_sales || 0) > 0;
    const hasStalePurchases = (metrics?.stale_draft_purchases || 0) > 0;

    return (
        <div className="space-y-6 pb-20">
            <PageHeader
                title="Dashboard Overview"
                description={`Executive summary for ${currentDate}`}
                actions={
                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            size="icon"
                            onClick={() => setRefreshTrigger(p => p + 1)}
                            icon={<Icons.Refresh className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />}
                            disabled={loading}
                            title="Refresh"
                        />
                        <div className="h-6 w-px bg-gray-200 mx-1 hidden sm:block"></div>
                        <Button onClick={() => navigate('/sales')} variant="success" icon={<Icons.Plus className="w-4 h-4" />}>New Sale</Button>
                        <Button onClick={() => navigate('/purchases')} variant="primary" icon={<Icons.Package className="w-4 h-4" />}>New Purchase</Button>
                    </div>
                }
            />

            {/* ALERTS SECTION */}
            {(hasStaleSales || hasStalePurchases) && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-in slide-in-from-top-4 fade-in duration-500">
                    {hasStaleSales && (
                        <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 flex items-start gap-4 shadow-sm">
                            <div className="p-2 bg-orange-100 rounded-full shrink-0">
                                <Icons.Warning className="w-5 h-5 text-orange-600" />
                            </div>
                            <div className="flex-1">
                                <h4 className="text-sm font-bold text-orange-900 flex justify-between items-center">
                                    Pending Sales Drafts
                                    <Badge variant="outline" className="bg-white text-orange-700 border-orange-200">{metrics?.stale_draft_sales}</Badge>
                                </h4>
                                <p className="text-xs text-orange-700 mt-1 mb-3 leading-relaxed">
                                    Drafts older than 48 hours detected. Finalize or delete to keep inventory accurate.
                                </p>
                                <Button size="sm" variant="outline" className="bg-white border-orange-200 text-orange-700 h-7 text-xs hover:bg-orange-100 w-full sm:w-auto" onClick={() => navigate('/sales/history?status=DRAFT')}>
                                    Review Drafts
                                </Button>
                            </div>
                        </div>
                    )}
                    {hasStalePurchases && (
                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start gap-4 shadow-sm">
                            <div className="p-2 bg-amber-100 rounded-full shrink-0">
                                <Icons.Warning className="w-5 h-5 text-amber-600" />
                            </div>
                            <div className="flex-1">
                                <h4 className="text-sm font-bold text-amber-900 flex justify-between items-center">
                                    Pending Purchase Drafts
                                    <Badge variant="outline" className="bg-white text-amber-700 border-amber-200">{metrics?.stale_draft_purchases}</Badge>
                                </h4>
                                <p className="text-xs text-amber-700 mt-1 mb-3 leading-relaxed">
                                    Drafts older than 48 hours detected. Please review to avoid confusion.
                                </p>
                                <Button size="sm" variant="outline" className="bg-white border-amber-200 text-amber-700 h-7 text-xs hover:bg-amber-100 w-full sm:w-auto" onClick={() => navigate('/purchases/history?status=DRAFT')}>
                                    Review Drafts
                                </Button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {isOwner && periodInfo && (
                <Section title="Period Status" description="Current accounting period status (Owner only).">
                    <Card className="border border-slate-200 bg-slate-50/70 shadow-sm">
                        <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                            <div className="space-y-1">
                                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Active Period</p>
                                <div className="flex items-center gap-2">
                                    <span className="text-sm font-semibold text-slate-800">{periodInfo.name}</span>
                                    <StatusBadge status={periodInfo.status} />
                                </div>
                                <p className="text-xs text-slate-500">{periodInfo.start_date} – {periodInfo.end_date}</p>
                            </div>
                            <Button
                                size="sm"
                                variant="outline"
                                className="border-slate-200 text-slate-700 bg-white hover:bg-slate-100"
                                onClick={() => navigate('/period-lock')}
                            >
                                Manage Period
                            </Button>
                        </CardContent>
                    </Card>
                </Section>
            )}

            {isOwner && (
                <Section title="Financial Health" description="Real-time overview of cash flow and obligations (Owner only).">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <Card className="bg-gradient-to-br from-emerald-50 to-white border-emerald-100 shadow-sm hover:shadow-md transition-all duration-300 group">
                            <CardContent className="p-6">
                                <div className="flex justify-between items-start">
                                    <div className="space-y-1">
                                        <p className="text-sm font-medium text-emerald-600 tracking-wide uppercase">Cash Balance (Est)</p>
                                        <h3 className="text-3xl font-bold text-slate-900 tracking-tight group-hover:scale-105 transition-transform duration-300 origin-left">
                                            {formatCurrency(metrics?.cash_balance || 0)}
                                        </h3>
                                        <p className="text-xs text-slate-500">Liquid cash on hand</p>
                                    </div>
                                    <div className="p-3 bg-emerald-100/50 rounded-xl text-emerald-600 group-hover:bg-emerald-100 transition-colors">
                                        <Icons.DollarSign className="w-6 h-6" />
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        <Card
                            onClick={(metrics?.total_ar || 0) > 0 ? () => navigate('/finance?tab=AR') : undefined}
                            className={`bg-gradient-to-br from-indigo-50 to-white border-indigo-100 shadow-sm hover:shadow-md transition-all duration-300 group ${(metrics?.total_ar || 0) > 0 ? 'cursor-pointer' : 'cursor-default opacity-75'}`}
                        >
                            <CardContent className="p-6">
                                <div className="flex justify-between items-start">
                                    <div className="space-y-1">
                                        <p className="text-sm font-medium text-indigo-600 tracking-wide uppercase">Total Receivables</p>
                                        <h3 className="text-3xl font-bold text-slate-900 tracking-tight group-hover:scale-105 transition-transform duration-300 origin-left">
                                            {formatCurrency(metrics?.total_ar || 0)}
                                        </h3>
                                        <p className="text-xs text-slate-500">Outstanding Invoices (AR)</p>
                                    </div>
                                    <div className="p-3 bg-indigo-100/50 rounded-xl text-indigo-600 group-hover:bg-indigo-100 transition-colors">
                                        <Icons.TrendingUp className="w-6 h-6" />
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        <Card
                            onClick={(metrics?.total_ap || 0) > 0 ? () => navigate('/finance?tab=AP') : undefined}
                            className={`bg-gradient-to-br from-rose-50 to-white border-rose-100 shadow-sm hover:shadow-md transition-all duration-300 group ${(metrics?.total_ap || 0) > 0 ? 'cursor-pointer' : 'cursor-default opacity-75'}`}
                        >
                            <CardContent className="p-6">
                                <div className="flex justify-between items-start">
                                    <div className="space-y-1">
                                        <p className="text-sm font-medium text-rose-600 tracking-wide uppercase">Total Payables</p>
                                        <h3 className="text-3xl font-bold text-slate-900 tracking-tight group-hover:scale-105 transition-transform duration-300 origin-left">
                                            {formatCurrency(metrics?.total_ap || 0)}
                                        </h3>
                                        <p className="text-xs text-slate-500">Unpaid Bills (AP)</p>
                                    </div>
                                    <div className="p-3 bg-rose-100/50 rounded-xl text-rose-600 group-hover:bg-rose-100 transition-colors">
                                        <Icons.TrendingDown className="w-6 h-6" />
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </Section>
            )}

            {isOwner && (arAging || apAging) && (
                <Section title="Aging Summary" description="Outstanding AR/AP by aging bucket (Owner only).">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        <Card className="border border-indigo-100 bg-indigo-50/30">
                            <CardContent className="p-5 space-y-2">
                                <div className="flex items-center justify-between">
                                    <h4 className="text-sm font-semibold text-indigo-800">Accounts Receivable</h4>
                                    <span className="text-xs text-indigo-500">AR Aging</span>
                                </div>
                                <div className="grid grid-cols-3 gap-3 text-xs text-slate-600">
                                    <div>
                                        <p className="uppercase text-[10px] text-slate-400">0–30</p>
                                        <p className="font-semibold text-slate-900">{formatCurrency(arAging?.bucket_0_30 || 0)}</p>
                                    </div>
                                    <div>
                                        <p className="uppercase text-[10px] text-slate-400">31–60</p>
                                        <p className="font-semibold text-slate-900">{formatCurrency(arAging?.bucket_31_60 || 0)}</p>
                                    </div>
                                    <div>
                                        <p className="uppercase text-[10px] text-slate-400">61+</p>
                                        <p className="font-semibold text-slate-900">{formatCurrency(arAging?.bucket_61_plus || 0)}</p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                        <Card className="border border-rose-100 bg-rose-50/30">
                            <CardContent className="p-5 space-y-2">
                                <div className="flex items-center justify-between">
                                    <h4 className="text-sm font-semibold text-rose-800">Accounts Payable</h4>
                                    <span className="text-xs text-rose-500">AP Aging</span>
                                </div>
                                <div className="grid grid-cols-3 gap-3 text-xs text-slate-600">
                                    <div>
                                        <p className="uppercase text-[10px] text-slate-400">0–30</p>
                                        <p className="font-semibold text-slate-900">{formatCurrency(apAging?.bucket_0_30 || 0)}</p>
                                    </div>
                                    <div>
                                        <p className="uppercase text-[10px] text-slate-400">31–60</p>
                                        <p className="font-semibold text-slate-900">{formatCurrency(apAging?.bucket_31_60 || 0)}</p>
                                    </div>
                                    <div>
                                        <p className="uppercase text-[10px] text-slate-400">61+</p>
                                        <p className="font-semibold text-slate-900">{formatCurrency(apAging?.bucket_61_plus || 0)}</p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </Section>
            )}

            {/* PERFORMANCE METRICS */}
            <Section title="Performance Overview" description="Key operational metrics for this month.">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {/* Sales Today */}
                    <Card className="bg-gradient-to-br from-blue-50/50 to-white border-blue-100 shadow-sm hover:shadow-md transition-all duration-300 group">
                        <CardContent className="p-6">
                            <div className="flex justify-between items-start">
                                <div>
                                    <p className="text-sm font-medium text-blue-600 tracking-wide uppercase">Sales Today</p>
                                    <h3 className="text-2xl font-bold text-slate-900 mt-1 group-hover:scale-105 transition-transform duration-300 origin-left">{formatCurrency(metrics?.sales_today || 0)}</h3>
                                    <div className="flex items-center mt-1 gap-1">
                                        <Badge variant="outline" className="text-[10px] bg-blue-50 text-blue-700 px-1 py-0 border-blue-200">
                                            {metrics?.sales_count_today || 0} txns
                                        </Badge>
                                    </div>
                                </div>
                                <div className="p-2 bg-blue-50 rounded-lg text-blue-600 group-hover:bg-blue-100 transition-colors">
                                    <Icons.Activity className="w-5 h-5" />
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Sales Month */}
                    <Card className="hover:shadow-md transition-all duration-300 shadow-sm group">
                        <CardContent className="p-6">
                            <div className="flex justify-between items-start">
                                <div>
                                    <p className="text-sm font-medium text-slate-600 tracking-wide uppercase">Sales (Month)</p>
                                    <h3 className="text-2xl font-bold text-slate-900 mt-1 group-hover:scale-105 transition-transform duration-300 origin-left">{formatCurrency(metrics?.sales_month || 0)}</h3>
                                    <p className="text-xs text-slate-400 mt-1">Revenue</p>
                                </div>
                                <div className="p-2 bg-slate-100 rounded-lg text-slate-500 group-hover:bg-slate-200 transition-colors">
                                    <Icons.Chart className="w-5 h-5" />
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Purchases Month */}
                    <Card className="hover:shadow-md transition-all duration-300 shadow-sm group">
                        <CardContent className="p-6">
                            <div className="flex justify-between items-start">
                                <div>
                                    <p className="text-sm font-medium text-slate-600 tracking-wide uppercase">Purchases (Month)</p>
                                    <h3 className="text-2xl font-bold text-slate-900 mt-1 group-hover:scale-105 transition-transform duration-300 origin-left">{formatCurrency(metrics?.purchases_month || 0)}</h3>
                                    <div className="flex items-center mt-1 gap-1">
                                        <Badge variant="outline" className="text-[10px] bg-slate-50 text-slate-600 px-1 py-0">
                                            {metrics?.purchases_count_month || 0} txns
                                        </Badge>
                                    </div>
                                </div>
                                <div className="p-2 bg-slate-100 rounded-lg text-slate-500 group-hover:bg-slate-200 transition-colors">
                                    <Icons.Cart className="w-5 h-5" />
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Low Stock */}
                    <Card className={`${(metrics?.low_stock_count || 0) > 0 ? "bg-red-50/50 border-red-200" : "bg-white border-slate-200"} shadow-sm hover:shadow-md transition-all duration-300 group`}>
                        <CardContent className="p-6">
                            <div className="flex justify-between items-start">
                                <div>
                                    <p className={(metrics?.low_stock_count || 0) > 0 ? "text-sm font-medium text-red-600 tracking-wide uppercase" : "text-sm font-medium text-slate-600 tracking-wide uppercase"}>Low Stock Items</p>
                                    <h3 className="text-2xl font-bold text-slate-900 mt-1 group-hover:scale-105 transition-transform duration-300 origin-left">{metrics?.low_stock_count || 0}</h3>
                                    <p className="text-xs text-slate-400 mt-1">out of {metrics?.total_items || 0} items</p>
                                </div>
                                <div className={(metrics?.low_stock_count || 0) > 0 ? "p-2 bg-red-100 rounded-lg text-red-600 group-hover:bg-red-200 transition-colors" : "p-2 bg-slate-100 rounded-lg text-slate-500 group-hover:bg-slate-200 transition-colors"}>
                                    <Icons.AlertCircle className="w-5 h-5" />
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </Section>

            {/* OPERATIONAL TRENDS */}
            <Section
                title="Operational Trends"
                description={`Last ${trendRangeDays} days sales & purchase activity.`}
                action={
                    <div className="flex items-center gap-1">
                        {[7, 14, 30].map((days) => (
                            <Button
                                key={days}
                                size="sm"
                                variant={trendRangeDays === days ? 'primary' : 'outline'}
                                onClick={() => setTrendRangeDays(days)}
                                className="h-8 px-2.5"
                            >
                                {days}D
                            </Button>
                        ))}
                    </div>
                }
            >
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <Card className="border border-slate-200 shadow-sm">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                                <Icons.TrendingUp className="w-4 h-4 text-indigo-500" />
                                Sales Trend
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="pt-2">
                            {trendLoading ? (
                                <div className="h-32 flex items-center justify-center text-xs text-slate-400">Loading...</div>
                            ) : (
                                <div className="relative">
                                    <div className="flex items-end gap-1 h-32 relative">
                                        {salesTrend.map((point, index) => {
                                            const max = Math.max(...salesTrend.map(p => p.total), 1)
                                            const heightPercent = (point.total / max) * 100
                                            const heightPx = Math.max(8, (heightPercent / 100) * 128) // 128px = h-32
                                            const isHovered = hoveredSalesIndex === index
                                            return (
                                                <div
                                                    key={point.date}
                                                    className="flex-1 flex flex-col items-center gap-1 relative group"
                                                    onMouseEnter={() => setHoveredSalesIndex(index)}
                                                    onMouseLeave={() => setHoveredSalesIndex(null)}
                                                >
                                                    <div
                                                        className="w-full bg-gradient-to-t from-indigo-500 to-indigo-300 rounded-t transition-all duration-200 cursor-pointer"
                                                        style={{
                                                            height: `${heightPx}px`,
                                                            transform: isHovered ? 'scaleY(1.05)' : 'scaleY(1)',
                                                            transformOrigin: 'bottom',
                                                            opacity: isHovered ? 1 : 0.85
                                                        }}
                                                    />
                                                    {isHovered && (
                                                        <div className="absolute -top-14 left-1/2 transform -translate-x-1/2 bg-slate-900 text-white text-xs px-2 py-1.5 rounded shadow-lg whitespace-nowrap z-10 animate-in fade-in slide-in-from-bottom-2 duration-200">
                                                            <div className="font-semibold">{formatCurrency(point.total)}</div>
                                                            <div className="text-[10px] text-slate-300">{new Date(point.date).toLocaleDateString('id-ID', { month: 'short', day: 'numeric' })}</div>
                                                            <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 translate-y-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-slate-900"></div>
                                                        </div>
                                                    )}
                                                </div>
                                            )
                                        })}
                                    </div>
                                </div>
                            )}
                            <div className="flex justify-between text-[10px] text-slate-400 mt-3">
                                <span>{salesTrend[0]?.date && new Date(salesTrend[0].date).toLocaleDateString('id-ID', { month: 'short', day: 'numeric' })}</span>
                                <span className="text-slate-500 font-medium">Total: {formatCurrency(salesTrend.reduce((sum, p) => sum + p.total, 0))}</span>
                                <span>{salesTrend[salesTrend.length - 1]?.date && new Date(salesTrend[salesTrend.length - 1].date).toLocaleDateString('id-ID', { month: 'short', day: 'numeric' })}</span>
                            </div>
                        </CardContent>
                    </Card>
                    <Card className="border border-slate-200 shadow-sm">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                                <Icons.Cart className="w-4 h-4 text-purple-500" />
                                Purchase Trend
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="pt-2">
                            {trendLoading ? (
                                <div className="h-32 flex items-center justify-center text-xs text-slate-400">Loading...</div>
                            ) : (
                                <div className="relative">
                                    <div className="flex items-end gap-1 h-32 relative">
                                        {purchaseTrend.map((point, index) => {
                                            const max = Math.max(...purchaseTrend.map(p => p.total), 1)
                                            const heightPercent = (point.total / max) * 100
                                            const heightPx = Math.max(8, (heightPercent / 100) * 128) // 128px = h-32
                                            const isHovered = hoveredPurchaseIndex === index
                                            return (
                                                <div
                                                    key={point.date}
                                                    className="flex-1 flex flex-col items-center gap-1 relative group"
                                                    onMouseEnter={() => setHoveredPurchaseIndex(index)}
                                                    onMouseLeave={() => setHoveredPurchaseIndex(null)}
                                                >
                                                    <div
                                                        className="w-full bg-gradient-to-t from-purple-500 to-purple-300 rounded-t transition-all duration-200 cursor-pointer"
                                                        style={{
                                                            height: `${heightPx}px`,
                                                            transform: isHovered ? 'scaleY(1.05)' : 'scaleY(1)',
                                                            transformOrigin: 'bottom',
                                                            opacity: isHovered ? 1 : 0.85
                                                        }}
                                                    />
                                                    {isHovered && (
                                                        <div className="absolute -top-14 left-1/2 transform -translate-x-1/2 bg-slate-900 text-white text-xs px-2 py-1.5 rounded shadow-lg whitespace-nowrap z-10 animate-in fade-in slide-in-from-bottom-2 duration-200">
                                                            <div className="font-semibold">{formatCurrency(point.total)}</div>
                                                            <div className="text-[10px] text-slate-300">{new Date(point.date).toLocaleDateString('id-ID', { month: 'short', day: 'numeric' })}</div>
                                                            <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 translate-y-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-slate-900"></div>
                                                        </div>
                                                    )}
                                                </div>
                                            )
                                        })}
                                    </div>
                                </div>
                            )}
                            <div className="flex justify-between text-[10px] text-slate-400 mt-3">
                                <span>{purchaseTrend[0]?.date && new Date(purchaseTrend[0].date).toLocaleDateString('id-ID', { month: 'short', day: 'numeric' })}</span>
                                <span className="text-slate-500 font-medium">Total: {formatCurrency(purchaseTrend.reduce((sum, p) => sum + p.total, 0))}</span>
                                <span>{purchaseTrend[purchaseTrend.length - 1]?.date && new Date(purchaseTrend[purchaseTrend.length - 1].date).toLocaleDateString('id-ID', { month: 'short', day: 'numeric' })}</span>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </Section>

            {/* INVENTORY MOVEMENT */}
            <Section title="Inventory Movement" description={`Inbound vs outbound movement (last ${trendRangeDays} days).`}>
                <Card className="border border-slate-200 shadow-sm">
                    <CardContent className="pt-4">
                        {trendLoading ? (
                            <div className="h-32 flex items-center justify-center text-xs text-slate-400">Loading...</div>
                        ) : (
                            <div className="relative">
                                <div className="flex items-end gap-1 h-32 relative">
                                    {stockTrend.map((point, index) => {
                                        const max = Math.max(...stockTrend.map(p => Math.max(p.qty_in, p.qty_out)), 1)
                                        const inHeightPercent = (point.qty_in / max) * 100
                                        const outHeightPercent = (point.qty_out / max) * 100
                                        const inHeightPx = Math.max(6, (inHeightPercent / 100) * 128) // 128px = h-32
                                        const outHeightPx = Math.max(6, (outHeightPercent / 100) * 128)
                                        const isHovered = hoveredStockIndex === index
                                        return (
                                            <div
                                                key={point.date}
                                                className="flex-1 flex items-end gap-0.5 relative group"
                                                onMouseEnter={() => setHoveredStockIndex(index)}
                                                onMouseLeave={() => setHoveredStockIndex(null)}
                                            >
                                                <div
                                                    className="flex-1 bg-gradient-to-t from-emerald-500 to-emerald-300 rounded-t transition-all duration-200 cursor-pointer"
                                                    style={{
                                                        height: `${inHeightPx}px`,
                                                        transform: isHovered ? 'scaleY(1.05)' : 'scaleY(1)',
                                                        transformOrigin: 'bottom',
                                                        opacity: isHovered ? 1 : 0.85
                                                    }}
                                                />
                                                <div
                                                    className="flex-1 bg-gradient-to-t from-rose-500 to-rose-300 rounded-t transition-all duration-200 cursor-pointer"
                                                    style={{
                                                        height: `${outHeightPx}px`,
                                                        transform: isHovered ? 'scaleY(1.05)' : 'scaleY(1)',
                                                        transformOrigin: 'bottom',
                                                        opacity: isHovered ? 1 : 0.85
                                                    }}
                                                />
                                                {isHovered && (
                                                    <div className="absolute -top-16 left-1/2 transform -translate-x-1/2 bg-slate-900 text-white text-xs px-2 py-1.5 rounded shadow-lg whitespace-nowrap z-10 animate-in fade-in slide-in-from-bottom-2 duration-200">
                                                        <div className="flex items-center gap-2">
                                                            <div>
                                                                <div className="text-[10px] text-emerald-300">In: {point.qty_in}</div>
                                                                <div className="text-[10px] text-rose-300">Out: {point.qty_out}</div>
                                                            </div>
                                                        </div>
                                                        <div className="text-[10px] text-slate-300 mt-0.5">{new Date(point.date).toLocaleDateString('id-ID', { month: 'short', day: 'numeric' })}</div>
                                                        <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 translate-y-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-slate-900"></div>
                                                    </div>
                                                )}
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>
                        )}
                        <div className="flex justify-between text-[10px] text-slate-400 mt-3">
                            <span>{stockTrend[0]?.date && new Date(stockTrend[0].date).toLocaleDateString('id-ID', { month: 'short', day: 'numeric' })}</span>
                            <div className="flex items-center gap-3">
                                <div className="flex items-center gap-1">
                                    <span className="w-2 h-2 bg-gradient-to-br from-emerald-500 to-emerald-300 rounded-sm" />
                                    <span className="text-slate-500 font-medium">In: {stockTrend.reduce((sum, p) => sum + p.qty_in, 0)}</span>
                                </div>
                                <div className="flex items-center gap-1">
                                    <span className="w-2 h-2 bg-gradient-to-br from-rose-500 to-rose-300 rounded-sm" />
                                    <span className="text-slate-500 font-medium">Out: {stockTrend.reduce((sum, p) => sum + p.qty_out, 0)}</span>
                                </div>
                            </div>
                            <span>{stockTrend[stockTrend.length - 1]?.date && new Date(stockTrend[stockTrend.length - 1].date).toLocaleDateString('id-ID', { month: 'short', day: 'numeric' })}</span>
                        </div>
                    </CardContent>
                </Card>
            </Section>

            {/* INSIGHTS & ACTIVITY */}
            <Section title="Business Insights" description="Recent transactions and top performing products." className="pb-8">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Top Items */}
                    <Card className="lg:col-span-1 shadow-md border-slate-200 flex flex-col">
                        <CardHeader className="bg-gradient-to-r from-amber-50 to-white border-b border-amber-100 pb-3">
                            <CardTitle className="text-base font-bold text-amber-900 flex items-center gap-2">
                                <Icons.Award className="w-5 h-5 text-amber-500" />
                                Top Products (This Month)
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-0 flex-1 overflow-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow className="hover:bg-transparent bg-amber-50/30">
                                        <TableHead className="text-xs uppercase text-amber-900/60 font-semibold">Item</TableHead>
                                        <TableHead className="text-right text-xs uppercase text-amber-900/60 font-semibold w-16">Qty</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {metrics?.top_items?.map((item, i) => (
                                        <TableRow key={i} className="hover:bg-amber-50/50 transition-colors">
                                            <TableCell className="py-3">
                                                <div className="font-medium text-slate-900 text-sm line-clamp-1" title={item.item_name}>{item.item_name}</div>
                                                <div className="text-xs text-slate-500 mt-0.5">{formatCurrency(item.total_amount)}</div>
                                            </TableCell>
                                            <TableCell className="text-right font-bold text-slate-700">{item.total_qty}</TableCell>
                                        </TableRow>
                                    ))}
                                    {!metrics?.top_items?.length && (
                                        <TableRow>
                                            <TableCell colSpan={2} className="text-center py-8 text-slate-400 italic text-sm">No sales data yet</TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>

                    {/* Recent Sales */}
                    <Card className="lg:col-span-1 shadow-md border-slate-200 flex flex-col">
                        <CardHeader className="bg-gradient-to-r from-slate-50 to-white border-b border-slate-100 pb-3 flex flex-row items-center justify-between">
                            <CardTitle className="text-base font-bold text-slate-800">Recent Sales</CardTitle>
                            <Button variant="ghost" size="sm" className="h-6 text-xs text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 px-2" onClick={() => navigate('/sales')}>
                                View All
                            </Button>
                        </CardHeader>
                        <CardContent className="p-0 flex-1 overflow-auto">
                            <Table>
                                <TableBody>
                                    {metrics?.recent_sales?.map((sale) => (
                                        <TableRow key={sale.id} className="cursor-pointer hover:bg-indigo-50/50 transition-colors group" onClick={() => navigate(`/sales/${sale.id}`)}>
                                            <TableCell className="py-3">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-mono text-xs text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded group-hover:bg-white group-hover:text-indigo-600 transition-colors">
                                                        {safeDocNo(sale.sales_no, sale.id)?.slice(-6)}
                                                    </span>
                                                    <span className="text-sm font-medium text-slate-900 truncate max-w-[100px]" title={sale.customer_name}>{sale.customer_name}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-right py-3">
                                                <div className="font-bold text-sm text-slate-700">{formatCurrency(sale.total_amount)}</div>
                                                <div className="scale-75 origin-right">
                                                    <StatusBadge status={sale.status} />
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                    {!metrics?.recent_sales?.length && (
                                        <TableRow>
                                            <TableCell colSpan={2} className="text-center py-8 text-slate-400 italic text-sm">No recent transactions</TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>

                    {/* Recent Purchases */}
                    <Card className="lg:col-span-1 shadow-md border-slate-200 flex flex-col">
                        <CardHeader className="bg-gradient-to-r from-slate-50 to-white border-b border-slate-100 pb-3 flex flex-row items-center justify-between">
                            <CardTitle className="text-base font-bold text-slate-800">Recent Purchases</CardTitle>
                            <Button variant="ghost" size="sm" className="h-6 text-xs text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 px-2" onClick={() => navigate('/purchases')}>
                                View All
                            </Button>
                        </CardHeader>
                        <CardContent className="p-0 flex-1 overflow-auto">
                            <Table>
                                <TableBody>
                                    {metrics?.recent_purchases?.map((purchase) => (
                                        <TableRow key={purchase.id} className="cursor-pointer hover:bg-indigo-50/50 transition-colors group" onClick={() => navigate(`/purchases/${purchase.id}`)}>
                                            <TableCell className="py-3">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-mono text-xs text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded group-hover:bg-white group-hover:text-indigo-600 transition-colors">
                                                        {safeDocNo(purchase.purchase_no, purchase.id)?.slice(-6)}
                                                    </span>
                                                    <span className="text-sm font-medium text-slate-900 truncate max-w-[100px]" title={purchase.vendor_name}>{purchase.vendor_name}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-right py-3">
                                                <div className="font-bold text-sm text-slate-700">{formatCurrency(purchase.total_amount)}</div>
                                                <div className="scale-75 origin-right">
                                                    <StatusBadge status={purchase.status} />
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                    {!metrics?.recent_purchases?.length && (
                                        <TableRow>
                                            <TableCell colSpan={2} className="text-center py-8 text-slate-400 italic text-sm">No recent transactions</TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </div>
            </Section>
        </div>
    )
}
