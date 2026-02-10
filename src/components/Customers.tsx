import { useCallback, useMemo, useState } from 'react'
import { supabase } from '../supabaseClient'
import { Button } from './ui/Button'
import { Icons } from './ui/Icons'
import { useConfirm } from './ui/ConfirmDialogContext'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/Dialog'
import CustomerForm, { type Customer } from './CustomerForm'
import CustomerList from './CustomerList'
import { useNavigate } from 'react-router-dom'
import { getErrorMessage } from '../lib/errors'
import { formatCurrency } from '../lib/format'
import { useCustomersQuery, useCustomerOutstandingQuery } from '../hooks/useQueries'

export default function Customers() {
    const navigate = useNavigate()
    const { confirm } = useConfirm()

    const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null)
    const [isModalOpen, setIsModalOpen] = useState(false)

    const { data: customers = [], isLoading, isFetching, error: fetchError, refetch } = useCustomersQuery()

    const { data: outstanding, isLoading: statsLoading, error: statsError, refetch: refetchOutstanding } = useCustomerOutstandingQuery()

    const stats = useMemo(() => {
        const active = customers.filter(c => c.is_active).length
        return {
            total: customers.length,
            active,
            inactive: customers.length - active,
            outstanding: statsError ? null : (outstanding ?? null)
        }
    }, [customers, outstanding, statsError])

    const handleSuccess = useCallback(() => {
        setEditingCustomer(null)
        setIsModalOpen(false)
        refetch()
        refetchOutstanding()
    }, [refetch, refetchOutstanding])

    const handleAddCustomer = useCallback(() => {
        setEditingCustomer(null)
        setIsModalOpen(true)
    }, [])

    const handleEdit = useCallback((customer: Customer) => {
        setEditingCustomer(customer)
        setIsModalOpen(true)
    }, [])

    const handlePrices = useCallback((customer: Customer) => {
        navigate(`/customers/${customer.id}/pricing`)
    }, [navigate])

    const handleView = useCallback((customer: Customer) => {
        navigate(`/customers/${customer.id}`)
    }, [navigate])

    const handleCreateSale = useCallback((customer: Customer) => {
        navigate(`/sales?customer=${customer.id}`)
    }, [navigate])

    const handleDelete = useCallback(async (id: string) => {
        const ok = await confirm({
            title: "Delete Customer",
            description: "Delete customer? This action cannot be undone.",
            confirmText: "Delete",
            cancelText: "Cancel",
            tone: "danger",
        })
        if (!ok) return
        const { error } = await supabase.from('customers').delete().eq('id', id)
        if (error) {
            void confirm({
                title: "Cannot Delete",
                description: "Could not delete. Try deactivating.",
                confirmText: "OK",
                hideCancel: true,
            })
        }
        else {
            refetch()
            refetchOutstanding()
        }
    }, [confirm, refetch, refetchOutstanding])

    const loading = isLoading || isFetching
    const fetchErrorMessage = fetchError ? getErrorMessage(fetchError) : null

    return (
        <div className="w-full space-y-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <h2 className="hidden md:block text-2xl font-bold tracking-tight">Customers Management</h2>
                <Button onClick={handleAddCustomer} icon={<Icons.Plus className="w-4 h-4" />} className="w-full sm:w-auto">Add Customer</Button>
            </div>

    {fetchErrorMessage && (
        <div className="p-4 bg-red-50 text-red-700 border border-red-200 rounded-md flex items-center gap-2">
            <Icons.Warning className="w-5 h-5 flex-shrink-0" /> Error: {fetchErrorMessage}
        </div>
    )}

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-gradient-to-br from-indigo-50 to-indigo-100 border border-indigo-200 rounded-lg p-5 shadow-sm hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-xs font-medium text-indigo-600 uppercase tracking-wider mb-1">Total Customers</p>
                            <p className="text-3xl font-bold text-indigo-900">{stats.total}</p>
                        </div>
                        <div className="w-12 h-12 bg-indigo-500 rounded-full flex items-center justify-center shadow-sm">
                            <Icons.Users className="w-6 h-6 text-white" />
                        </div>
                    </div>
                </div>

                <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 border border-emerald-200 rounded-lg p-5 shadow-sm hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-xs font-medium text-emerald-600 uppercase tracking-wider mb-1">Active / Inactive</p>
                            <p className="text-3xl font-bold text-emerald-900">{stats.active} <span className="text-lg text-slate-500">/</span> <span className="text-2xl text-slate-600">{stats.inactive}</span></p>
                        </div>
                        <div className="w-12 h-12 bg-emerald-500 rounded-full flex items-center justify-center shadow-sm">
                            <Icons.CheckCircle className="w-6 h-6 text-white" />
                        </div>
                    </div>
                </div>

                <div className="bg-gradient-to-br from-amber-50 to-amber-100 border border-amber-200 rounded-lg p-5 shadow-sm hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-xs font-medium text-amber-600 uppercase tracking-wider mb-1">Outstanding AR</p>
                            <p className="text-2xl font-bold text-amber-900">
                                {statsLoading ? '...' : stats.outstanding === null ? '-' : formatCurrency(stats.outstanding)}
                            </p>
                        </div>
                        <div className="w-12 h-12 bg-amber-500 rounded-full flex items-center justify-center shadow-sm">
                            <Icons.DollarSign className="w-6 h-6 text-white" />
                        </div>
                    </div>
                </div>
            </div>

            <CustomerList
                customers={customers}
                loading={loading}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onPrices={handlePrices}
                onView={handleView}
                onCreateSale={handleCreateSale}
            />

            <Dialog isOpen={isModalOpen} onClose={() => setIsModalOpen(false)}>
                <DialogHeader>
                    <DialogTitle>{editingCustomer ? 'Edit Customer' : 'New Customer'}</DialogTitle>
                </DialogHeader>
                <DialogContent>
                    <CustomerForm
                        initialData={editingCustomer}
                        onSuccess={handleSuccess}
                        onCancel={() => setIsModalOpen(false)}
                    />
                </DialogContent>
            </Dialog>

        </div >
    )
}
