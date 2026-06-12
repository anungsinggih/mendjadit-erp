import { useState } from 'react'
import { supabase } from '../supabaseClient'
import { getErrorMessage } from "../lib/errors";
import { useNavigate, useParams } from 'react-router-dom'
import { useSalesReturnDetailQuery, useQueryClient } from '../hooks/useQueries'
import { Button } from './ui/Button'
import { Icons } from './ui/Icons'
import { formatCurrency, formatDate, safeDocNo } from '../lib/format'
import DocumentHeaderCard from './shared/DocumentHeaderCard'
import LineItemsTable from './shared/LineItemsTable'
import { useConfirm } from './ui/ConfirmDialogContext'

type SalesReturnDetail = {
    id: string
    return_date: string
    sales_id: string
    sales_no: string | null
    customer_name: string
    total_amount: number
    status: 'DRAFT' | 'POSTED' | 'VOID'
    notes: string | null
    payment_method_code: string | null
    created_at: string
}

type ReturnItem = {
    id: string
    item_id: string
    item_name: string
    sku: string
    uom_snapshot: string
    qty: number
    unit_price: number
    subtotal: number
    cost_snapshot: number
}

type SalesReturnDetailProps = {
    returnId?: string
    embedded?: boolean
    onClose?: () => void
}

export default function SalesReturnDetail({ returnId, embedded = false, onClose }: SalesReturnDetailProps = {}) {
    const { id: routeId } = useParams<{ id: string }>()
    const id = returnId || routeId
    const navigate = useNavigate()
    const queryClient = useQueryClient()

    // --- React Query for all detail data ---
    const { data: detailData, isLoading: loading, error: fetchError, refetch } = useSalesReturnDetailQuery(id)
    const returnDoc = detailData?.returnDoc ?? null
    const items = detailData?.items ?? []
    const error = fetchError ? getErrorMessage(fetchError, 'Failed to fetch return detail') : null

    // --- Action state ---
    const [success, setSuccess] = useState<string | null>(null)
    const [actionError, setActionError] = useState<string | null>(null)
    const [posting, setPosting] = useState(false)
    const [deleting, setDeleting] = useState(false)
    const { confirm } = useConfirm()

    async function handlePost() {
        if (!returnDoc) return
        const ok = await confirm({
            title: 'Post Sales Return',
            description: 'Confirm POST Return? This handles Stock, AR & Journals.',
            confirmText: 'POST',
            cancelText: 'Cancel',
            tone: 'danger'
        })
        if (!ok) return

        setPosting(true)
        setSuccess(null)
        try {
            const { error: postError } = await supabase.rpc('rpc_post_sales_return', { p_return_id: returnDoc.id })
            if (postError) throw postError
            setSuccess("Return POSTED Successfully!")
            queryClient.invalidateQueries({ queryKey: ["sales-returns-history"] })
            refetch()
        } catch (err: unknown) {
            setActionError(getErrorMessage(err, 'Unknown error'))
        } finally {
            setPosting(false)
        }
    }

    async function handleDelete() {
        if (!returnDoc) return
        const ok = await confirm({
            title: 'Delete Draft Return',
            description: 'Delete this draft return? This action cannot be undone.',
            confirmText: 'Delete',
            cancelText: 'Cancel',
            tone: 'danger'
        })
        if (!ok) return
        setDeleting(true)
        setActionError(null)
        try {
            const { error: delError } = await supabase
                .from('sales_returns')
                .delete()
                .eq('id', returnDoc.id)
                .eq('status', 'DRAFT')
            if (delError) throw delError
            queryClient.invalidateQueries({ queryKey: ["sales-returns-history"] })
            if (embedded) onClose?.()
            else navigate('/sales-returns/history')
        } catch (err: unknown) {
            setActionError(getErrorMessage(err, 'Failed to delete return'))
        } finally {
            setDeleting(false)
        }
    }

    if (loading) {
        return (
            <div className="w-full p-8 text-center">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
                <p className="mt-2 text-gray-600">Loading return detail...</p>
            </div>
        )
    }

    const displayError = error || actionError

    if (displayError || !returnDoc) {
        return (
            <div className="w-full p-8">
                <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-md flex items-center gap-2">
                    <Icons.Warning className="w-5 h-5 flex-shrink-0" /> {displayError || 'Return not found'}
                </div>
                <Button onClick={() => embedded ? onClose?.() : navigate('/sales-returns/history')} className="mt-4">
                    {embedded ? 'Close' : '← Back to List'}
                </Button>
            </div>
        )
    }

    const headerFields = [
        {
            label: 'Return Date',
            value: formatDate(returnDoc.return_date),
        },
        {
            label: 'Original Sales',
            value: <span className="font-mono text-sm">{safeDocNo(returnDoc.sales_no, returnDoc.sales_id)}</span>,
        },
        {
            label: 'Customer',
            value: returnDoc.customer_name,
        },
        {
            label: 'Refund Method',
            value: returnDoc.payment_method_code || 'CASH',
        },
        {
            label: 'Total',
            value: <span className="font-bold text-lg">{formatCurrency(returnDoc.total_amount)}</span>,
        },
    ]

    const lineItemColumns = [
        {
            label: 'SKU',
            cellClassName: 'font-mono text-sm',
            render: (item: ReturnItem) => item.sku,
        },
        {
            label: 'Item Name',
            render: (item: ReturnItem) => item.item_name,
        },
        {
            label: 'UoM',
            render: (item: ReturnItem) => item.uom_snapshot,
        },
        {
            label: 'Qty',
            headerClassName: 'text-right',
            cellClassName: 'text-right',
            render: (item: ReturnItem) => item.qty,
        },
        {
            label: 'Avg Cost',
            headerClassName: 'text-right',
            cellClassName: 'text-right',
            render: (item: ReturnItem) => formatCurrency(item.cost_snapshot),
        },
        {
            label: 'Unit Price',
            headerClassName: 'text-right',
            cellClassName: 'text-right',
            render: (item: ReturnItem) => formatCurrency(item.unit_price),
        },
        {
            label: 'Subtotal',
            headerClassName: 'text-right',
            cellClassName: 'text-right font-medium',
            render: (item: ReturnItem) => formatCurrency(item.subtotal),
        },
    ]

    return (
        <div className="w-full space-y-6">
            {success && (
                <div className="p-4 bg-green-50 border border-green-200 text-green-700 rounded-md flex items-center gap-2">
                    <Icons.CheckCircle className="w-5 h-5 flex-shrink-0" /> {success}
                </div>
            )}
            {error && (
                <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-md flex items-center gap-2">
                    <Icons.Warning className="w-5 h-5 flex-shrink-0" /> {error}
                </div>
            )}
            <div className="flex justify-between items-center">
                {!embedded && <h2 className="hidden md:block text-3xl font-bold tracking-tight text-gray-900">Sales Return</h2>}
                <div className="flex gap-2 no-print">
                    <Button onClick={() => embedded ? onClose?.() : navigate('/sales-returns/history')} variant="outline">
                        {embedded ? 'Close' : '← Back to List'}
                    </Button>
                    {returnDoc.status === 'DRAFT' && (
                        <>
                            <Button onClick={handlePost} disabled={posting} className="bg-green-600 hover:bg-green-700 text-white">
                                {posting ? 'Posting...' : 'POST Return'}
                            </Button>
                            <Button onClick={handleDelete} disabled={deleting} variant="ghost" className="text-red-600 hover:text-red-700 hover:bg-red-50">
                                {deleting ? 'Deleting...' : 'Delete Draft'}
                            </Button>
                        </>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-1 space-y-6">
                    <DocumentHeaderCard
                        title="Sales Return"
                        docNo={safeDocNo(null, returnDoc.id, true)}
                        status={returnDoc.status}
                        fields={headerFields}
                        notes={returnDoc.notes}
                    />
                </div>
                <div className="lg:col-span-2">
                    <LineItemsTable
                        title="Return Items"
                        rows={items}
                        columns={lineItemColumns}
                        totalValue={formatCurrency(returnDoc.total_amount)}
                        emptyLabel="No items added"
                    />
                </div>
            </div>
        </div>
    )
}
