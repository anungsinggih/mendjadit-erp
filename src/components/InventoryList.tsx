import { useEffect, useState, useCallback, memo } from "react";
import type { MouseEvent } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/Table";
import { Button } from "./ui/Button";
import { Input } from "./ui/Input";
import { Icons } from "./ui/Icons";
import { Badge } from "./ui/Badge";
import { usePagination } from "../hooks/usePagination";
import { Pagination } from "./ui/Pagination";
import { Section } from "./ui/Section";
import { ButtonSelect } from "./ui/ButtonSelect";
import { useDebounce } from "../hooks/useDebounce";
import { useInventoryQuery, type InventoryQueryItem } from "../hooks/useQueries";

type Props = {
    selectedId: string | null
    onSelect: (id: string | null) => void
    onAdjust: (id: string, name: string) => void
    onClearSelection?: () => void
    refreshTrigger: number
}

type InventoryRowProps = {
    item: InventoryQueryItem
    isSelected: boolean
    onSelect: (id: string | null) => void
    onAdjust: (id: string, name: string) => void
}

const InventoryRow = memo(function InventoryRow({ item, isSelected, onSelect, onAdjust }: InventoryRowProps) {
    const stock = item.inventory_stock?.qty_on_hand || 0

    const handleSelect = useCallback(() => {
        onSelect(isSelected ? null : item.id)
    }, [isSelected, item.id, onSelect])

    const handleAdjust = useCallback((e: MouseEvent<HTMLButtonElement>) => {
        e.stopPropagation()
        onAdjust(item.id, item.name)
    }, [item.id, item.name, onAdjust])

    return (
        <TableRow
            className={`cursor-pointer transition-all border-b border-gray-50 ${isSelected ? 'bg-indigo-50/50 hover:bg-indigo-50' : 'hover:bg-slate-50'}`}
            onClick={handleSelect}
        >
            <TableCell>
                <div className={`font-semibold  ${isSelected ? 'text-indigo-700' : 'text-slate-900'}`}>{item.name}</div>
                <div className="text-xs text-slate-500 font-mono mt-0.5">{item.sku}</div>
            </TableCell>
            <TableCell className="text-center text-xs text-slate-600">
                {item.size_name || '-'}
            </TableCell>
            <TableCell className="text-center text-xs text-slate-600">
                {item.color_name || '-'}
            </TableCell>
            <TableCell className="text-right">
                <Badge
                    variant="outline"
                    className={`
                        ${stock > 0 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'}
                    `}
                >
                    {stock.toLocaleString()} <span className="text-[10px] ml-1 opacity-70">{item.uom}</span>
                </Badge>
            </TableCell>
            <TableCell>
                <Button
                    size="sm"
                    variant="ghost"
                    className="hover:bg-red-50 text-red-600 hover:text-red-700 h-9 w-9 p-0 rounded-full"
                    onClick={handleAdjust}
                    title="Adjust Stock"
                >
                    <Icons.Edit className="w-4 h-4" />
                </Button>
            </TableCell>
        </TableRow>
    )
})

export function InventoryList({ selectedId, onSelect, onAdjust, refreshTrigger }: Props) {
    const [search, setSearch] = useState("")
    const [typeFilter, setTypeFilter] = useState("ALL")
    const debouncedSearch = useDebounce(search, 350)

    const { page, setPage, pageSize, range } = usePagination({ defaultPageSize: 20 });
    const { data, isLoading, isFetching } = useInventoryQuery({
        range,
        search: debouncedSearch,
        typeFilter,
        refreshTrigger
    })

    // Reset page on search
    useEffect(() => {
        setPage(1);
    }, [debouncedSearch, typeFilter, setPage]);

    // Derived state for display
    const filtered = data?.items || [];
    const pageCount = data?.count || 0;
    const loading = isLoading || isFetching;

    return (
        <Section
            title="Cek Stok"
            description="View and search real-time stock availability."
            className="h-full flex flex-col shadow-lg border-0 ring-1 ring-slate-900/5 bg-white overflow-hidden"
        >
            <div className="flex flex-col h-full">
                <div className="p-4 border-b border-gray-100 bg-gray-50/50">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                        <div className="relative flex-1">
                            <Icons.Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                            <Input
                                placeholder="Search by SKU or Name..."
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                className="pl-9 bg-white"
                                containerClassName="!mb-0"
                            />
                        </div>
                        <div className="sm:min-w-[360px]">
                            <ButtonSelect
                                value={typeFilter}
                                onChange={setTypeFilter}
                                className="!mb-0"
                                buttonClassName="h-9"
                                options={[
                                    { label: "All", value: "ALL" },
                                    { label: "Raw Material", value: "RAW_MATERIAL" },
                                    { label: "Traded", value: "TRADED" },
                                    { label: "Finished Good", value: "FINISHED_GOOD" },
                                ]}
                            />
                        </div>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto min-h-0">
                    <Table>
                        <TableHeader className="bg-white sticky top-0 z-30 shadow-sm">
                            <TableRow>
                                <TableHead>Item</TableHead>
                                <TableHead className="w-20 text-center">Size</TableHead>
                                <TableHead className="w-20 text-center">Color</TableHead>
                                <TableHead className="text-right">Stock</TableHead>
                                <TableHead>&nbsp;</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? (
                                <TableRow><TableCell colSpan={5} className="text-center py-12 text-slate-500">
                                    <div className="flex justify-center items-center gap-2">
                                        <div className="animate-spin w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full"></div>
                                        <span>Loading...</span>
                                    </div>
                                </TableCell></TableRow>
                            ) : filtered.length === 0 ? (
                                <TableRow><TableCell colSpan={5} className="text-center py-12 text-slate-400 italic">No items found</TableCell></TableRow>
                            ) : (
                                filtered.map(item => (
                                    <InventoryRow
                                        key={item.id}
                                        item={item}
                                        isSelected={selectedId === item.id}
                                        onSelect={onSelect}
                                        onAdjust={onAdjust}
                                    />
                                ))
                            )}
                        </TableBody>
                    </Table>
                </div>
                <div className="border-t border-gray-100 p-2">
                    <Pagination
                        currentPage={page}
                        totalCount={pageCount}
                        pageSize={pageSize}
                        onPageChange={setPage}
                        isLoading={loading}
                    />
                </div>
            </div>
        </Section>
    )
}
