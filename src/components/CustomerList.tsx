import { useMemo, useState, memo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from './ui/Card'
import { Button } from './ui/Button'
import { Input } from './ui/Input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/Table'
import { Badge } from './ui/Badge'
import { CustomerBadge } from './ui/CustomerBadge'
import { Icons } from './ui/Icons'
import { type Customer } from './CustomerForm'
import { useDebounce } from '../hooks/useDebounce'

interface CustomerListProps {
    customers: Customer[]
    loading: boolean
    onEdit: (customer: Customer) => void
    onDelete: (id: string) => void
    onPrices: (customer: Customer) => void
    onView: (customer: Customer) => void
    onCreateSale: (customer: Customer) => void
}

function CustomerList({ customers, loading, onEdit, onDelete, onPrices, onView, onCreateSale }: CustomerListProps) {
    const [searchTerm, setSearchTerm] = useState('')
    const debouncedSearch = useDebounce(searchTerm, 350)

    const filteredCustomers = useMemo(() => (
        customers.filter(c =>
            c.name.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
            (c.phone && c.phone.includes(debouncedSearch)) ||
            (c.address && c.address.toLowerCase().includes(debouncedSearch.toLowerCase()))
        )
    ), [customers, debouncedSearch])

    return (
        <Card>
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle>Customer Directory ({filteredCustomers.length})</CardTitle>
                <div className="w-full sm:w-1/3 sm:min-w-[200px]">
                    <Input
                        placeholder="Search customers..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        className="h-9 mb-0"
                        containerClassName="!mb-0"
                    />
                </div>
            </CardHeader>
            <CardContent className="p-0">
                <div className="overflow-x-auto">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Name</TableHead>
                                <TableHead>Phone</TableHead>
                                <TableHead>Address</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? <TableRow><TableCell colSpan={5} className="text-center">Loading...</TableCell></TableRow> : filteredCustomers.map(c => (
                                <TableRow key={c.id} className={!c.is_active ? 'bg-gray-100 opacity-60' : ''}>
                                    <TableCell className="font-medium">
                                        <button
                                            type="button"
                                            onClick={() => onView(c)}
                                            className="text-left text-slate-900 hover:text-blue-700"
                                        >
                                            <CustomerBadge name={c.name} customerType={c.customer_type} />
                                        </button>
                                    </TableCell>
                                    <TableCell>{c.phone}</TableCell>
                                    <TableCell className="max-w-xs truncate">{c.address}</TableCell>
                                    <TableCell>
                                        <Badge variant={c.is_active ? 'success' : 'secondary'}>
                                            {c.is_active ? 'Active' : 'Inactive'}
                                        </Badge>
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex justify-end gap-1">
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => onCreateSale(c)}
                                                className="h-9 w-9 p-0 text-slate-500 hover:text-indigo-600"
                                            >
                                                <Icons.Cart className="w-[20px] h-[20px]" />
                                            </Button>
                                            {c.customer_type === 'CUSTOM' && (
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() => onPrices(c)}
                                                    className="h-9 w-9 p-0 text-slate-500 hover:text-indigo-600"
                                                >
                                                    <Icons.Tag className="w-[20px] h-[20px]" />
                                                </Button>
                                            )}
                                            <Button size="sm" variant="ghost" onClick={() => onEdit(c)} className="h-9 w-9 p-0 text-slate-500 hover:text-indigo-600">
                                                <Icons.Edit className="w-[22px] h-[22px]" />
                                            </Button>
                                            <Button size="sm" variant="ghost" onClick={() => onDelete(c.id)} className="h-9 w-9 p-0 text-slate-400 hover:text-rose-600">
                                                <Icons.Trash className="w-[22px] h-[22px]" />
                                            </Button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            </CardContent>
        </Card >
    )
}

export default memo(CustomerList)
