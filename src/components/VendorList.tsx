import { useMemo, useState, memo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from './ui/Card'
import { Button } from './ui/Button'
import { Input } from './ui/Input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/Table'
import { Badge } from './ui/Badge'
import { Icons } from './ui/Icons'
import { type Vendor } from './VendorForm'
import { useDebounce } from '../hooks/useDebounce'

interface VendorListProps {
    vendors: Vendor[]
    loading: boolean
    onEdit: (vendor: Vendor) => void
    onDelete: (id: string) => void
    onView: (vendor: Vendor) => void
    onCreatePurchase: (vendor: Vendor) => void
}

function VendorList({ vendors, loading, onEdit, onDelete, onView, onCreatePurchase }: VendorListProps) {
    const [searchTerm, setSearchTerm] = useState('')
    const debouncedSearch = useDebounce(searchTerm, 350)

    const filteredVendors = useMemo(() => (
        vendors.filter(v =>
            v.name.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
            (v.phone && v.phone.includes(debouncedSearch)) ||
            (v.address && v.address.toLowerCase().includes(debouncedSearch.toLowerCase()))
        )
    ), [vendors, debouncedSearch])

    const getTypeLabel = (type?: Vendor['vendor_type']) => {
        switch (type) {
            case 'KONVEKSI':
                return 'Konveksi'
            case 'INTERNAL':
                return 'Internal'
            case 'SUPPLIER':
            default:
                return 'Supplier'
        }
    }

    return (
        <Card>
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle>Vendor Directory ({filteredVendors.length})</CardTitle>
                <div className="w-full sm:w-1/3 sm:min-w-[200px]">
                    <Input
                        placeholder="Search vendors..."
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
                                <TableHead>Type</TableHead>
                                <TableHead>Phone</TableHead>
                                <TableHead>Address</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? <TableRow><TableCell colSpan={6} className="text-center">Loading...</TableCell></TableRow> : filteredVendors.map(v => (
                                <TableRow key={v.id} className={!v.is_active ? 'bg-gray-100 opacity-60' : ''}>
                                    <TableCell className="font-medium">
                                        <button
                                            type="button"
                                            onClick={() => onView(v)}
                                            className="text-left text-slate-900 hover:text-blue-700"
                                        >
                                            {v.name}
                                        </button>
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant="outline">{getTypeLabel(v.vendor_type)}</Badge>
                                    </TableCell>
                                    <TableCell>{v.phone}</TableCell>
                                    <TableCell className="max-w-xs truncate">{v.address}</TableCell>
                                    <TableCell>
                                        <Badge variant={v.is_active ? 'success' : 'secondary'}>
                                            {v.is_active ? 'Active' : 'Inactive'}
                                        </Badge>
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex justify-end gap-1">
                                            <Button size="sm" variant="outline" onClick={() => onCreatePurchase(v)} className="h-9 w-9 p-0 text-slate-500 hover:text-indigo-600">
                                                <Icons.Cart className="w-[20px] h-[20px]" />
                                            </Button>
                                            <Button size="sm" variant="ghost" onClick={() => onEdit(v)} className="h-9 w-9 p-0 text-slate-500 hover:text-indigo-600">
                                                <Icons.Edit className="w-[22px] h-[22px]" />
                                            </Button>
                                            <Button size="sm" variant="ghost" onClick={() => onDelete(v.id)} className="h-9 w-9 p-0 text-slate-400 hover:text-rose-600">
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
        </Card>
    )
}

export default memo(VendorList)
