import { useEffect, useState, useCallback, memo, useMemo } from 'react'
import { supabase } from '../supabaseClient'
import { Card, CardContent, CardHeader, CardTitle } from './ui/Card'
import { Input } from './ui/Input'
import { Button } from './ui/Button'
import { Icons } from './ui/Icons'
import { useNavigate } from 'react-router-dom'
import { usePagination } from '../hooks/usePagination'
import { Pagination } from './ui/Pagination'
import { formatCurrency, formatDate, toNumber } from '../lib/format'
import { getErrorMessage } from '../lib/errors'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { ResponsiveTable } from './ui/ResponsiveTable'

type JournalEntry = {
    id: string
    journal_date: string
    ref_type: string
    ref_id: string
    memo: string
    created_at: string
    lines: JournalLine[]
    ref_display?: string
}

type JournalLine = {
    id: string
    account_code: string
    account_name: string
    debit: number
    credit: number
}

// --- SUB-COMPONENT: JOURNAL ITEM WITH ACCORDION ---
const JournalEntryItem = memo(function JournalEntryItem({
    journal,
    getRefTypeBadge,
    isExpanded,
    onToggle
}: {
    journal: JournalEntry
    getRefTypeBadge: (t: string) => React.ReactNode
    isExpanded: boolean
    onToggle: (id: string) => void
}) {
    const totalDebit = journal.lines.reduce((sum, line) => sum + toNumber(line.debit), 0)
    const totalCredit = journal.lines.reduce((sum, line) => sum + toNumber(line.credit), 0)
    const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01

    // Extract reference info from memo if available (e.g. "Sales INV-001")
    const memo = journal.memo || ''
    const docNo = journal.ref_display || journal.ref_id

    // Clean memo to remove auto-generated prefixes if any, or just keep as is
    const cleanedMemo = memo

    const handleToggle = useCallback(() => {
        onToggle(journal.id)
    }, [journal.id, onToggle])

    return (
        <div className={`bg-white rounded-lg border transition-all duration-200 ${isExpanded ? 'shadow-md ring-1 ring-indigo-500/20 border-indigo-200' : 'hover:shadow-sm border-slate-200'}`}>
            <div
                className="p-4 cursor-pointer flex items-start gap-4 group"
                onClick={handleToggle}
            >
                {/* Icon Column */}
                <div className="flex-shrink-0 pt-1">
                    <div className={`
                        w-8 h-8 rounded-full flex items-center justify-center border transition-colors
                        ${isExpanded ? 'bg-indigo-50 border-indigo-200 text-indigo-600' : 'bg-slate-50 border-slate-200 text-slate-400 group-hover:border-indigo-300 group-hover:text-indigo-500'}
                    `}>
                        <Icons.ChevronDown className={`w-4 h-4 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                    </div>
                </div>

                {/* Main Content */}
                <div className="flex-1 min-w-0">
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-y-2.5 gap-x-4">
                        <div className="space-y-1.5">
                            <div className="flex items-center gap-2.5 flex-wrap">
                                <span className="text-sm font-semibold text-slate-900">{formatDate(journal.journal_date)}</span>
                                <span className="text-slate-300">|</span>
                                <span className="font-mono text-[11px] text-slate-600 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                                    {docNo || `JRN-${journal.id.substring(0, 8)}`}
                                </span>
                                {getRefTypeBadge(journal.ref_type)}
                            </div>
                            <h3 className="text-sm font-medium text-slate-700 leading-snug">
                                {cleanedMemo || <span className="italic text-slate-400">No description</span>}
                            </h3>
                            {!isBalanced && (
                                <div className="flex items-center gap-1.5 text-xs text-rose-600 font-medium bg-rose-50 px-2 py-1 rounded-md w-fit">
                                    <Icons.Warning className="w-3.5 h-3.5" />
                                    Unbalanced Entry
                                </div>
                            )}
                        </div>

                        {/* Amount Column */}
                        <div className="text-left sm:text-right flex-shrink-0">
                            <div className="text-base font-bold text-slate-900">
                                {formatCurrency(totalDebit)}
                            </div>
                            <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mt-0.5">
                                Total Amount
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Expanded Details */}
            {isExpanded && (
                <div className="border-t border-slate-100 bg-slate-50/50 rounded-b-lg overflow-hidden animate-in slide-in-from-top-2 duration-200">
                    <ResponsiveTable minWidth="640px">
<table className="w-full text-sm text-left">
                            <thead className="text-xs text-slate-500 uppercase bg-slate-100/80 border-b border-slate-200">
                                <tr>
                                    <th className="px-4 py-2 font-medium w-[50%]">Account</th>
                                    <th className="px-4 py-2 font-medium text-right w-[25%]">Debit</th>
                                    <th className="px-4 py-2 font-medium text-right w-[25%]">Credit</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {journal.lines.map((line) => (
                                    <tr key={line.id} className="hover:bg-white transition-colors">
                                        <td className="px-4 py-3 text-sm font-medium text-slate-700">
                                            <span className="text-slate-500 font-mono text-xs">{line.account_code}</span>
                                            <span className="text-slate-400 mx-1.5">·</span>
                                            <span>{line.account_name}</span>
                                        </td>
                                        <td className="px-4 py-3 text-right font-mono text-sm text-slate-700">
                                            {line.debit > 0 ? formatCurrency(line.debit) : '-'}
                                        </td>
                                        <td className="px-4 py-3 text-right font-mono text-sm text-slate-700">
                                            {line.credit > 0 ? formatCurrency(line.credit) : '-'}
                                        </td>
                                    </tr>
                                ))}
                                <tr className="bg-slate-100/50 font-bold text-slate-800 border-t border-slate-200">
                                    <td className="px-4 py-2 text-right text-xs uppercase tracking-wider">Total</td>
                                    <td className="px-4 py-2 text-right font-mono border-t border-slate-300/50">{formatCurrency(totalDebit)}</td>
                                    <td className="px-4 py-2 text-right font-mono border-t border-slate-300/50">{formatCurrency(totalCredit)}</td>
                                </tr>
                            </tbody>
                        </table>
</ResponsiveTable>
                </div>
            )}
        </div>
    )
})

export default function Journals() {
    const [searchInput, setSearchInput] = useState('')
    const [startDate, setStartDate] = useState('')
    const [endDate, setEndDate] = useState('')
    const [openJournalId, setOpenJournalId] = useState<string | null>(null)
    const navigate = useNavigate()

    const { page, setPage, pageSize } = usePagination({ defaultPageSize: 25 })

    const handleToggle = useCallback((id: string) => {
        setOpenJournalId(prev => (prev === id ? null : id))
    }, [])

    // Fetch ALL journals once — no server-side search/pagination
    const { data: allJournals, isLoading, isFetching, error: fetchError, refetch } = useQuery({
        queryKey: ['journals'],
        queryFn: async () => {
            // Fetch journals + lines + accounts in one query via nested select
            const { data: journalsData, error: journalsError } = await supabase
                .from('journals')
                .select(`
                    *,
                    journal_lines (
                        id,
                        account_id,
                        debit,
                        credit,
                        accounts (
                            code,
                            name
                        )
                    )
                `)
                .order('journal_date', { ascending: false })
                .order('created_at', { ascending: false })

            if (journalsError) throw journalsError

            const journalsList = journalsData || []

            const normalizeRefType = (refType?: string) => (refType || '').toLowerCase()
            const shortId = (id?: string | null) => (id ? id.substring(0, 8) : '')

            // Fetch all ref numbers in parallel — avoid .in() with large ID arrays
            const [salesNos, purchaseNos, salesReturnNos, purchaseReturnNos, receiptNos, paymentNos, periodNames] = await Promise.all([
                supabase.from('sales').select('id,sales_no'),
                supabase.from('purchases').select('id,purchase_no'),
                supabase.from('sales_returns').select('id,return_no'),
                supabase.from('purchase_returns').select('id,return_no'),
                supabase.from('receipts').select('id,receipt_no'),
                supabase.from('payments').select('id,payment_no'),
                supabase.from('accounting_periods').select('id,name'),
            ])

            const salesMap = new Map((salesNos.data || []).map(row => [row.id, row.sales_no]))
            const purchaseMap = new Map((purchaseNos.data || []).map(row => [row.id, row.purchase_no]))
            const salesReturnMap = new Map((salesReturnNos.data || []).map(row => [row.id, row.return_no]))
            const purchaseReturnMap = new Map((purchaseReturnNos.data || []).map(row => [row.id, row.return_no]))
            const receiptMap = new Map((receiptNos.data || []).map(row => [row.id, row.receipt_no]))
            const paymentMap = new Map((paymentNos.data || []).map(row => [row.id, row.payment_no]))
            const periodMap = new Map((periodNames.data || []).map(row => [row.id, row.name]))

            const resolveRefDisplay = (journal: { id: string; ref_type: string; ref_id: string }) => {
                const refType = normalizeRefType(journal.ref_type)
                const refId = journal.ref_id
                if (refType === 'sales') return salesMap.get(refId) || `SAL-${shortId(refId)}`
                if (refType === 'purchase') return purchaseMap.get(refId) || `PUR-${shortId(refId)}`
                if (refType === 'sales_return') return salesReturnMap.get(refId) || `SRET-${shortId(refId)}`
                if (refType === 'purchase_return') return purchaseReturnMap.get(refId) || `PRET-${shortId(refId)}`
                if (refType === 'receipt') return receiptMap.get(refId) || `RCPT-${shortId(refId)}`
                if (refType === 'payment') return paymentMap.get(refId) || `PAY-${shortId(refId)}`
                if (refType === 'period_close_hpp') return periodMap.get(refId) || `HPP-${shortId(refId)}`
                if (refType === 'opening_stock') return `OPEN-${shortId(refId)}`
                if (refType === 'adjustment') return `ADJ-${shortId(refId)}`
                if (refType === 'manual') return `MAN-${shortId(refId)}`
                return shortId(refId) || `JRN-${shortId(journal.id)}`
            }

            const enrichedJournals = journalsList.map(journal => {
                const rawLines = Array.isArray(journal.journal_lines) ? journal.journal_lines : []
                const lines: JournalLine[] = rawLines.map((line: {
                    id: string
                    account_id: string
                    debit: number
                    credit: number
                    accounts: { code: string; name: string } | { code: string; name: string }[] | null
                }) => {
                    const account = Array.isArray(line.accounts) ? line.accounts[0] : line.accounts
                    return {
                        id: line.id,
                        account_code: account?.code || '',
                        account_name: account?.name || '',
                        debit: toNumber(line.debit),
                        credit: toNumber(line.credit),
                    }
                })
                return {
                    ...journal,
                    ref_display: resolveRefDisplay(journal),
                    lines,
                }
            })

            return enrichedJournals as JournalEntry[]
        },
        staleTime: 30_000,
        placeholderData: keepPreviousData
    })

    const loading = isLoading || isFetching
    const fetchErrorMessage = fetchError ? getErrorMessage(fetchError, 'Failed to fetch journals') : null

    // All client-side: search, date filter, pagination — instant
    const filteredJournals = useMemo(() => {
        let result = allJournals ?? []

        if (startDate) result = result.filter(j => j.journal_date >= startDate)
        if (endDate) result = result.filter(j => j.journal_date <= endDate)

        if (searchInput.trim()) {
            const term = searchInput.toLowerCase()
            result = result.filter(j =>
                j.memo?.toLowerCase().includes(term) ||
                j.ref_type?.toLowerCase().includes(term) ||
                j.ref_display?.toLowerCase().includes(term)
            )
        }

        return result
    }, [allJournals, searchInput, startDate, endDate])

    const totalCount = filteredJournals.length
    const paginatedJournals = useMemo(() => {
        const start = (page - 1) * pageSize
        return filteredJournals.slice(start, start + pageSize)
    }, [filteredJournals, page, pageSize])

    // Reset page when filters change
    useEffect(() => { setPage(1) }, [searchInput, startDate, endDate, setPage])


    const getRefTypeBadge = useCallback((refType: string) => {
        const normalized = (refType || '').toUpperCase()
        const config: { [key: string]: { class: string, icon: React.ReactNode, label: string } } = {
            'SALES': { class: 'bg-emerald-50 text-emerald-700 border-emerald-200 ring-emerald-500/20', icon: <Icons.TrendingUp className="w-3 h-3" />, label: 'Sales' },
            'PURCHASE': { class: 'bg-blue-50 text-blue-700 border-blue-200 ring-blue-500/20', icon: <Icons.TrendingDown className="w-3 h-3" />, label: 'Purchase' },
            'SALES_RETURN': { class: 'bg-amber-50 text-amber-700 border-amber-200 ring-amber-500/20', icon: <Icons.RotateCcw className="w-3 h-3" />, label: 'Sale Return' },
            'PURCHASE_RETURN': { class: 'bg-orange-50 text-orange-700 border-orange-200 ring-orange-500/20', icon: <Icons.RotateCw className="w-3 h-3" />, label: 'Purch Return' },
            'RECEIPT': { class: 'bg-sky-50 text-sky-700 border-sky-200 ring-sky-500/20', icon: <Icons.ArrowDownLeft className="w-3 h-3" />, label: 'Receipt' },
            'PAYMENT': { class: 'bg-rose-50 text-rose-700 border-rose-200 ring-rose-500/20', icon: <Icons.ArrowUpRight className="w-3 h-3" />, label: 'Payment' },
            'ADJUSTMENT': { class: 'bg-violet-50 text-violet-700 border-violet-200 ring-violet-500/20', icon: <Icons.Sliders className="w-3 h-3" />, label: 'Adjustment' },
            'GENERAL': { class: 'bg-slate-50 text-slate-700 border-slate-200 ring-slate-500/20', icon: <Icons.FileText className="w-3 h-3" />, label: 'General' }
        }

        const style = config[normalized] || { class: 'bg-slate-50 text-slate-600 border-slate-200', icon: null, label: normalized }

        return (
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ring-1 ring-inset ${style.class}`}>
                {style.icon}
                {style.label}
            </span>
        )
    }, [])

    return (
        <div className="w-full max-w-6xl mx-auto space-y-6 px-3 sm:px-4 lg:px-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <h2 className="hidden md:block text-3xl font-bold tracking-tight text-gray-900">
                    Journal Entries
                    {isFetching && !isLoading && (
                        <span className="ml-3 inline-block align-middle">
                            <div className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin inline-block"></div>
                        </span>
                    )}
                </h2>
                <div className="flex gap-2">
                    <Button
                        onClick={() => refetch()}
                        variant="outline"
                        size="icon"
                        icon={<Icons.Refresh className="w-4 h-4" />}
                        title="Refresh"
                    />
                    <Button
                        onClick={() => navigate('/journals/manual')}
                        icon={<Icons.Edit className="w-4 h-4" />}
                    >
                        Add Journal
                    </Button>
                </div>
            </div>

            {fetchErrorMessage && (
                <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-md flex items-center gap-2">
                    <Icons.Warning className="w-5 h-5" /> {fetchErrorMessage}
                </div>
            )}

            {/* Filters */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-lg">Filters</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
                        <Input
                            label="Search (Type / Memo)"
                            value={searchInput}
                            onChange={(e) => setSearchInput(e.target.value)}
                            placeholder="Min. 2 karakter..."
                        />
                        <Input
                            label="Start Date"
                            type="date"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                        />
                        <Input
                            label="End Date"
                            type="date"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                        />
                    </div>
                </CardContent>
            </Card>

            {/* Summary */}
            <div className="flex flex-col gap-1 text-sm text-gray-600 sm:flex-row sm:justify-between sm:items-center">
                <span>Showing <strong>{paginatedJournals.length}</strong> of <strong>{totalCount}</strong> journal entries</span>
                <div className="flex flex-wrap gap-2 text-xs text-gray-500">
                    <span>Total: {formatCurrency(filteredJournals.reduce((sum, j) => sum + j.lines.reduce((s, l) => s + toNumber(l.debit) + toNumber(l.credit), 0), 0))}</span>
                    <span className="hidden sm:inline-block">·</span>
                    <span>Balanced count: {filteredJournals.filter(j => j.lines.reduce((s, l) => s + toNumber(l.debit), 0) === j.lines.reduce((s, l) => s + toNumber(l.credit), 0)).length}</span>
                </div>
            </div>

            {/* Journal List with Accordion */}
            <div className="space-y-4">
                {isLoading ? (
                    <div className="w-full py-16 text-center">
                        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
                        <p className="mt-3 text-slate-500 text-sm">Loading journals...</p>
                    </div>
                ) : filteredJournals.length === 0 ? (
                    <Card>
                        <CardContent className="py-12 text-center text-gray-500">
                            <p className="text-lg flex items-center justify-center gap-2"><Icons.FileText className="w-5 h-5" /> No journal entries found</p>
                            <p className="text-sm mt-2">Journals are automatically created when transactions are posted</p>
                        </CardContent>
                    </Card>
                ) : (
                    paginatedJournals.map((journal) => (
                        <JournalEntryItem
                            key={journal.id}
                            journal={journal}
                            getRefTypeBadge={getRefTypeBadge}
                            isExpanded={openJournalId === journal.id}
                            onToggle={handleToggle}
                        />
                    ))
                )}
            </div>

            <Pagination
                currentPage={page}
                totalCount={totalCount}
                pageSize={pageSize}
                onPageChange={setPage}
                isLoading={loading}
            />
        </div>
    )
}
