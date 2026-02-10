import { useNavigate } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from './ui/Card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/Table'
import { Button } from './ui/Button'
import { Icons } from './ui/Icons'
import { EmptyState } from './ui/EmptyState'
import { StatusBadge } from './ui/StatusBadge'
import { formatCurrency, formatDate } from '../lib/format'
import { useSalesReturnHistoryQuery } from '../hooks/useQueries'

export default function SalesReturnHistory() {
    const navigate = useNavigate()

    const { data, isLoading, isFetching, error: fetchError, refetch } = useSalesReturnHistoryQuery()

    const returns = data || []
    const loading = isLoading || isFetching
    const fetchErrorMessage = fetchError instanceof Error ? fetchError.message : fetchError ? 'Failed to fetch sales returns' : null

    if (loading) {
        return (
            <div className="w-full p-8 text-center">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
                <p className="mt-2 text-gray-600">Loading sales returns...</p>
            </div>
        )
    }

    return (
        <div className="w-full space-y-6">
            <div className="flex justify-between items-center">
                <h2 className="hidden md:block text-3xl font-bold tracking-tight text-gray-900">Sales Return History</h2>
                <div className="flex gap-2">
                    <Button onClick={() => refetch()} variant="outline" size="icon" icon={<Icons.Refresh className="w-4 h-4" />} title="Refresh" />
                    <Button onClick={() => navigate('/sales-return')} icon={<Icons.Plus className="w-4 h-4" />}>
                        New Return
                    </Button>
                </div>
            </div>

            {fetchErrorMessage && (
                <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-md flex items-center gap-2">
                    <Icons.Warning className="w-5 h-5" /> {fetchErrorMessage}
                </div>
            )}

            <Card>
                <CardHeader>
                    <CardTitle>All Sales Return Documents</CardTitle>
                </CardHeader>
                <CardContent>
                    {returns.length === 0 ? (
                        <EmptyState
                            icon={<Icons.FileText className="w-5 h-5" />}
                            title="No sales return documents found"
                            description="Create your first return to get started"
                        />
                    ) : (
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Return Date</TableHead>
                                        <TableHead>Return ID</TableHead>
                                        <TableHead>Original Sales</TableHead>
                                        <TableHead>Customer</TableHead>
                                        <TableHead className="text-right">Total</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead className="text-right">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {returns.map((ret) => (
                                        <TableRow
                                            key={ret.id}
                                            className="cursor-pointer hover:bg-slate-50"
                                            onClick={() => navigate(`/sales-returns/${ret.id}`)}
                                        >
                                            <TableCell>{formatDate(ret.return_date)}</TableCell>
                                            <TableCell className="font-mono text-sm">
                                                {ret.return_no}
                                            </TableCell>
                                            <TableCell className="font-mono text-sm">
                                                {ret.sales_no}
                                            </TableCell>
                                            <TableCell>{ret.customer_name}</TableCell>
                                            <TableCell className="text-right font-medium">
                                                {formatCurrency(ret.total_amount)}
                                            </TableCell>
                                            <TableCell><StatusBadge status={ret.status} /></TableCell>
                                            <TableCell className="text-right">
                                                <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                                                    {ret.status === 'DRAFT' && (
                                                        <Button
                                                            size="icon"
                                                            variant="outline"
                                                            onClick={(e) => {
                                                                e.stopPropagation()
                                                                navigate(`/sales-return?draft=${ret.id}`)
                                                            }}
                                                            icon={<Icons.Edit className="w-4 h-4" />}
                                                            aria-label="Edit return"
                                                            title="Edit"
                                                        />
                                                    )}
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}
