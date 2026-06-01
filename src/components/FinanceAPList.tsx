import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "../supabaseClient";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "./ui/Table";
import { ResponsiveTable } from './ui/ResponsiveTable';
import { Button } from "./ui/Button";
import { Icons } from "./ui/Icons";
import { Card, CardContent } from "./ui/Card";

type AP = {
    id: string;
    bill_date: string;
    bill_no: string;
    vendor: { name: string };
    total_amount: number;
    outstanding_amount: number;
    status: string;
};

type Props = {
    selectedId: string | null;
    onSelect: (id: string, amount: number) => void;
    refreshTrigger: number;
    initialSelectedId?: string | null;
};

export function FinanceAPList({ selectedId, onSelect, refreshTrigger, initialSelectedId }: Props) {
    const [apListRaw, setApListRaw] = useState<AP[]>([]);
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState("");
    const [dateFrom, setDateFrom] = useState("");
    const [dateTo, setDateTo] = useState("");
    const [statusFilter, setStatusFilter] = useState("OUTSTANDING");

    // Client-side instant search — no debounce needed, data already in memory
    const apList = useMemo(() => {
        if (!search.trim()) return apListRaw
        const q = search.toLowerCase()
        return apListRaw.filter(item =>
            item.bill_no?.toLowerCase().includes(q) ||
            item.vendor?.name?.toLowerCase().includes(q)
        )
    }, [apListRaw, search])

    // Auto-search from prop (Deep Linking)
    useEffect(() => {
        if (initialSelectedId) {
            setSearch(initialSelectedId);
        }
    }, [initialSelectedId]);

    // Auto-open modal if initialSelectedId is found
    useEffect(() => {
        if (initialSelectedId && apList.length > 0) {
            const item = apList.find(i => i.id === initialSelectedId);
            if (item) {
                // Trigger parent onSelect to open modal
                onSelect(item.id, item.outstanding_amount);
            }
        }
    }, [initialSelectedId, apList, onSelect]);

    const fetchAP = useCallback(async () => {
        setLoading(true);
        try {
            let query = supabase
                .from("ap_bills")
                .select("*, vendor:vendors(name)")
                .order("bill_date", { ascending: true });

            if (statusFilter === "OUTSTANDING") {
                query = query.neq("status", "PAID").gt("outstanding_amount", 0);
            } else if (statusFilter === "UNPAID" || statusFilter === "PARTIAL" || statusFilter === "PAID") {
                query = query.eq("status", statusFilter);
            }

            if (dateFrom) query = query.gte("bill_date", dateFrom);
            if (dateTo) query = query.lte("bill_date", dateTo);

            const { data, error } = await query;
            if (error) throw error;
            setApListRaw(data || []);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    }, [dateFrom, dateTo, statusFilter]);

    useEffect(() => {
        fetchAP();
    }, [fetchAP, refreshTrigger]);

    return (
        <div className="space-y-4 h-full">
            {/* Compact Filter Toolbar */}
            <div className="bg-white border border-slate-200 rounded-lg p-3 flex flex-col lg:flex-row gap-3 items-center justify-between shadow-sm">
                <div className="flex flex-1 gap-2 w-full lg:w-auto overflow-x-auto no-scrollbar items-center">
                    <div className="flex items-center gap-2 border-r border-slate-200 pr-3 mr-1">
                        <Icons.Search className="w-4 h-4 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Search bill..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="bg-transparent border-none text-sm focus:ring-0 w-32 lg:w-48 placeholder:text-slate-400"
                        />
                    </div>

                    <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-500 font-medium">Date:</span>
                        <input
                            type="date"
                            value={dateFrom}
                            onChange={(e) => setDateFrom(e.target.value)}
                            className="h-8 text-xs border-slate-200 rounded-md focus:border-indigo-500 focus:ring-indigo-500"
                        />
                        <span className="text-slate-300">-</span>
                        <input
                            type="date"
                            value={dateTo}
                            onChange={(e) => setDateTo(e.target.value)}
                            className="h-8 text-xs border-slate-200 rounded-md focus:border-indigo-500 focus:ring-indigo-500"
                        />
                    </div>

                    <div className="h-6 w-px bg-slate-200 mx-1"></div>

                    <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-500 font-medium">Status:</span>
                        <select
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}
                            className="h-8 text-xs border-slate-200 rounded-md focus:border-indigo-500 focus:ring-indigo-500 bg-slate-50"
                        >
                            <option value="OUTSTANDING">Outstanding</option>
                            <option value="UNPAID">Unpaid</option>
                            <option value="PARTIAL">Partial</option>
                            <option value="PAID">Paid</option>
                            <option value="ALL">All Status</option>
                        </select>
                    </div>
                </div>

                <div className="flex items-center gap-2 w-full lg:w-auto">
                    {(search || dateFrom || dateTo || statusFilter !== "OUTSTANDING") && (
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 text-slate-500 hover:text-slate-700"
                            onClick={() => {
                                setSearch("");
                                setDateFrom("");
                                setDateTo("");
                                setStatusFilter("OUTSTANDING");
                            }}
                        >
                            <Icons.Close className="w-3 h-3 mr-1" />
                            Clear
                        </Button>
                    )}
                    <div className="px-3 py-1 bg-rose-50 text-rose-700 rounded-full text-xs font-semibold">
                        {apList.length} Bills
                    </div>
                </div>
            </div>

            {/* Results Card */}
            <Card className="shadow-sm border border-slate-200 overflow-hidden">
                <CardContent className="p-0">
                    <ResponsiveTable minWidth="640px">
                        <Table>
                            <TableHeader className="bg-slate-50 border-b border-slate-200">
                                <TableRow className="hover:bg-transparent">
                                    <TableHead className="w-[140px] font-semibold text-slate-600">Date / Due</TableHead>
                                    <TableHead className="font-semibold text-slate-600">Vendor Details</TableHead>
                                    <TableHead className="text-right font-semibold text-slate-600">Total</TableHead>
                                    <TableHead className="text-right font-semibold text-slate-600">Outstanding</TableHead>
                                    <TableHead className="w-[100px] text-center font-semibold text-slate-600">Action</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {loading ? (
                                    <TableRow>
                                        <TableCell colSpan={5} className="text-center py-20 text-slate-500">
                                            <div className="flex flex-col justify-center items-center gap-3">
                                                <div className="animate-spin w-6 h-6 border-2 border-rose-600 border-t-transparent rounded-full"></div>
                                                <span className="text-sm">Loading bills...</span>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ) : apList.length === 0 ? (
                                    <TableRow>
                                        <TableCell
                                            colSpan={5}
                                            className="text-center italic py-20 text-slate-400"
                                        >
                                            <div className="flex flex-col items-center gap-3">
                                                <div className="p-3 bg-slate-50 rounded-full">
                                                    <Icons.CheckCircle className="w-8 h-8 text-slate-300" />
                                                </div>
                                                <span>No bills found matching criteria.</span>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    apList.map((item) => {
                                        const isSelected = selectedId === item.id;
                                        const isPaid = item.status === 'PAID';
                                        return (
                                            <TableRow
                                                key={item.id}
                                                className={`cursor-pointer transition-all border-b border-slate-100 last:border-0 ${isSelected ? "bg-rose-50/60 hover:bg-rose-50" : "hover:bg-slate-50"}`}
                                                onClick={() => onSelect(item.id, item.outstanding_amount)}
                                            >
                                                <TableCell className="">
                                                    <div className="flex flex-col">
                                                        <span className="font-medium text-slate-700">{new Date(item.bill_date).toLocaleDateString("id-ID", { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                                                        <span className={`text-[10px] font-bold mt-0.5 px-1.5 py-0.5 rounded w-fit ${item.status === 'PARTIAL' ? 'bg-orange-100 text-orange-700' : item.status === 'PAID' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                                                            {item.status}
                                                        </span>
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <div className="flex flex-col">
                                                        <span className="font-semibold text-slate-900">{item.vendor?.name}</span>
                                                        <span className="text-xs text-slate-500 flex items-center gap-1">
                                                            <Icons.FileText className="w-3 h-3" />
                                                            {item.bill_no || '-'}
                                                        </span>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <span className="text-slate-600 font-medium">Rp {item.total_amount.toLocaleString("id-ID")}</span>
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    {isPaid ? (
                                                        <span className="text-emerald-600 font-bold text-xs">LUNAS</span>
                                                    ) : (
                                                        <span className="font-bold text-rose-600">
                                                            Rp {item.outstanding_amount.toLocaleString("id-ID")}
                                                        </span>
                                                    )}
                                                </TableCell>
                                                <TableCell className="text-center">
                                                    {isSelected ? (
                                                        <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-rose-100 text-rose-600 shadow-sm animate-in zoom-in duration-200">
                                                            <Icons.Check className="w-5 h-5" />
                                                        </span>
                                                    ) : (
                                                        <Button
                                                            size="sm"
                                                            variant="ghost"
                                                            className="h-8 px-3 text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50 font-medium"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                onSelect(item.id, item.outstanding_amount);
                                                            }}
                                                            disabled={isPaid}
                                                        >
                                                            Select
                                                        </Button>
                                                    )}
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })
                                )}
                            </TableBody>
                        </Table>
                    </ResponsiveTable>
                </CardContent>
            </Card>
        </div>
    );
}
