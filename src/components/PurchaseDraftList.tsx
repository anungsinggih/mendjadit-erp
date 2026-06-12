import { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "../supabaseClient";
import { Button } from "./ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/Card";
import { Icons } from "./ui/Icons";
import { StatusBadge } from "./ui/StatusBadge";
import { useNavigate } from "react-router-dom";
import { getErrorMessage } from "../lib/errors";
import { useConfirm } from "./ui/ConfirmDialogContext";
import { usePagination } from "../hooks/usePagination";
import { Pagination } from "./ui/Pagination";

import { formatCurrency } from "../lib/format";

type PurchaseDraft = {
    id: string;
    purchase_date?: string;
    purchase_no?: string | null;
    terms?: string;
    total_amount?: number;
    vendor?: { name?: string };
};

type Props = {
    refreshTrigger: number;
    onSuccess: (msg: string) => void;
    onError: (msg: string) => void;
};

export function PurchaseDraftList({ refreshTrigger, onSuccess, onError }: Props) {
    const [drafts, setDrafts] = useState<PurchaseDraft[]>([]);
    const [postingId, setPostingId] = useState<string | null>(null);
    const navigate = useNavigate();
    const { confirm } = useConfirm();
    const { page, setPage, pageSize, range } = usePagination({ defaultPageSize: 5 });

    const fetchDrafts = useCallback(async () => {
        const { data } = await supabase
            .from("purchases")
            .select("*, vendor:vendors(name)")
            .eq("status", "DRAFT")
            .order("created_at", { ascending: false });
        setDrafts(data || []);
    }, []);

    useEffect(() => {
        fetchDrafts();
    }, [fetchDrafts, refreshTrigger]);

    useEffect(() => {
        setPage(1);
    }, [drafts.length, setPage]);

    const pagedDrafts = useMemo(
        () => drafts.slice(range[0], range[1] + 1),
        [drafts, range]
    );

    async function handlePost(draft: PurchaseDraft) {
        setPostingId(draft.id);

        let dpTotal = 0;
        try {
            const { data: dpData } = await supabase
                .from('journals')
                .select('id')
                .eq('ref_type', 'PURCHASE_DP')
                .eq('ref_id', draft.id);
            if (dpData && dpData.length > 0) {
                const { data: lines } = await supabase
                    .from('journal_lines')
                    .select('debit')
                    .in('journal_id', dpData.map(d => d.id))
                    .gt('debit', 0);
                dpTotal = (lines || []).reduce((sum, l) => sum + (Number(l.debit) || 0), 0);
            }
        } catch {
            // non-fatal
        }

        const total = draft.total_amount || 0;
        const summaryContent = (
            <div className="space-y-3 text-sm pt-2 text-left">
                <div className="p-3 bg-slate-50 rounded border border-slate-100 space-y-1">
                    <div className="flex justify-between">
                        <span className="text-gray-500">Total Purchase:</span>
                        <span className="font-semibold">{formatCurrency(total)}</span>
                    </div>
                    {dpTotal > 0 && (
                        <div className="flex justify-between text-indigo-600 font-medium">
                            <span>DP Terbayar:</span>
                            <span>-{formatCurrency(dpTotal)}</span>
                        </div>
                    )}
                    <div className="flex justify-between border-t pt-1 mt-1 font-bold text-slate-900">
                        <span>Sisa {draft.terms === 'CASH' ? 'Bayar' : 'Hutang'}:</span>
                        <span>{formatCurrency(Math.max(0, total - dpTotal))}</span>
                    </div>
                </div>
                <div className="text-xs text-amber-600 bg-amber-50 p-2 rounded border border-amber-100 italic">
                    Stok akan bertambah dan jurnal akan terbentuk. Tindakan ini tidak bisa dibatalkan.
                </div>
            </div>
        );

        const ok = await confirm({
            title: "Konfirmasi Post Purchase",
            description: summaryContent,
            confirmText: "POST SEKARANG",
            cancelText: "Batal",
            tone: "default",
        });
        if (!ok) {
            setPostingId(null);
            return;
        }

        try {
            const { error } = await supabase.rpc("rpc_post_purchase", {
                p_purchase_id: draft.id,
            });
            if (error) throw error;
            onSuccess("Purchase POSTED!");
            navigate(`/purchases/${draft.id}`);
        } catch (err: unknown) {
            onError(getErrorMessage(err));
        } finally {
            setPostingId(null);
        }
    }

    return (
        <Card className="h-full shadow-md border-gray-200 flex flex-col">
            <CardHeader className="bg-yellow-50/50 border-b border-yellow-100 pb-4">
                <CardTitle className="text-yellow-800 flex items-center gap-2">
                    <Icons.FileText className="w-5 h-5" /> Pending Drafts
                </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 p-4 flex flex-col">
                {drafts.length === 0 ? (
                    <p className="text-gray-400 text-sm text-center py-10 italic">
                        No pending drafts.
                    </p>
                ) : (
                    <>
                        <div className="flex-1 overflow-y-auto max-h-[520px] pr-1">
                            <ul className="space-y-4">
                                {pagedDrafts.map((d) => {
                                    const isPosting = postingId === d.id;
                                    return (
                                        <li
                                            key={d.id}
                                            className="p-4 border border-gray-100 rounded-lg hover:border-purple-300 hover:shadow-md transition-all bg-white"
                                        >
                                            <div className="flex justify-between items-start mb-3">
                                                <div>
                                                    <div className="font-bold text-gray-900">
                                                        {d.vendor?.name}
                                                    </div>
                                                    <div className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                                                        <Icons.Calendar className="w-3 h-3" />{" "}
                                                        {d.purchase_date}
                                                    </div>
                                                </div>
                                                <StatusBadge status="DRAFT" />
                                            </div>
                                            <div className="flex flex-col sm:flex-row gap-3 mt-6">
                                                <Button
                                                    type="button"
                                                    onClick={() => handlePost(d)}
                                                    disabled={isPosting}
                                                    className="w-full sm:w-auto min-h-[44px] bg-blue-600 hover:bg-blue-700"
                                                    icon={<Icons.Check className="w-4 h-4" />}
                                                >
                                                    {isPosting ? "Posting..." : "POST Purchase"}
                                                </Button>
                                            </div>
                                        </li>
                                    );
                                })}
                            </ul>
                        </div>
                        <Pagination
                            currentPage={page}
                            totalCount={drafts.length}
                            pageSize={pageSize}
                            onPageChange={setPage}
                        />
                    </>
                )}
            </CardContent>
        </Card>
    );
}