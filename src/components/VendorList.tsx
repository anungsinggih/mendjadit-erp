import { useEffect, useMemo, useState, memo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from './ui/Card'
import { Button } from './ui/Button'
import { Input } from './ui/Input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/Table'
import { Badge } from './ui/Badge'
import { Icons } from './ui/Icons'
import { type Vendor } from './VendorForm'
import { useDebounce } from '../hooks/useDebounce'
import { usePagination } from '../hooks/usePagination'
import { Pagination } from './ui/Pagination'

interface VendorListProps {
    vendors: Vendor[]
    loading: boolean
    onEdit: (vendor: Vendor) => void
    onDelete: (id: string) => void
    onView: (vendor: Vendor) => void
    onCreatePurchase: (vendor: Vendor) => void
    onPrefetch?: (id: string) => void
}

function VendorList({ vendors, loading, onEdit, onDelete, onView, onCreatePurchase, onPrefetch }: VendorListProps) {
    const [searchTerm, setSearchTerm] = useState('')
    const debouncedSearch = useDebounce(searchTerm, 500)

    const filteredVendors = useMemo(() => (
        vendors.filter(v =>
            v.name.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
            (v.phone && v.phone.includes(debouncedSearch)) ||
            (v.address && v.address.toLowerCase().includes(debouncedSearch.toLowerCase()))
        )
    ), [vendors, debouncedSearch])

    const { page, setPage, pageSize, range } = usePagination({ defaultPageSize: 15 })

    useEffect(() => {
        setPage(1)
    }, [debouncedSearch, setPage])

    const pagedVendors = useMemo(
        () => filteredVendors.slice(range[0], range[1] + 1),
        [filteredVendors, range]
    )

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
                            {loading ? <TableRow><TableCell colSpan={6} className="text-center">Loading...</TableCell></TableRow> : pagedVendors.map(v => (
                                <TableRow
                                    key={v.id}
                                    className={!v.is_active ? 'bg-gray-100 opacity-60' : ''}
                                    onClick={() => onView(v)}
                                    onMouseEnter={() => onPrefetch?.(v.id)}
                                >
                                    <TableCell className="font-medium">
                                        <div className="text-left text-slate-900">
                                            {v.name}
                                        </div>
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
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onCreatePurchase(v);
                                                }}
                                                className="h-9 w-9 p-0 text-slate-500 hover:text-indigo-600"
                                            >
                                                <Icons.Cart className="w-[20px] h-[20px]" />
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onEdit(v);
                                                }}
                                                className="h-9 w-9 p-0 text-slate-500 hover:text-indigo-600"
                                            >
                                                <Icons.Edit className="w-[22px] h-[22px]" />
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onDelete(v.id);
                                                }}
                                                className="h-9 w-9 p-0 text-slate-400 hover:text-rose-600"
                                            >
                                                <Icons.Trash className="w-[22px] h-[22px]" />
                                            </Button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
                <Pagination
                    currentPage={page}
                    totalCount={filteredVendors.length}
                    pageSize={pageSize}
                    onPageChange={setPage}
                    isLoading={loading}
                />
            </CardContent>
        </Card>
    )
}

export default memo(VendorList)
