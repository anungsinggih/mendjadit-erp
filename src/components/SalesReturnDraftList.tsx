import { useEffect, useState, useCallback } from "react";
import { supabase } from "../supabaseClient";
import { Button } from "./ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/Card";
import { Badge } from "./ui/Badge";
import { Icons } from "./ui/Icons";
import { getErrorMessage } from "../lib/errors";
import { useNavigate } from "react-router-dom";
import { useConfirm } from "./ui/ConfirmDialogContext";

type DraftReturn = {
    id: string
    return_date: string
    sales?: {
        sales_no: string
        customer?: { name: string }
    }
}

type Props = {
    refreshTrigger: number;
    onSuccess: (msg: string) => void;
    onError: (msg: string) => void;
};

export function SalesReturnDraftList({ refreshTrigger, onSuccess, onError }: Props) {
    const [drafts, setDrafts] = useState<DraftReturn[]>([]);
    const [postingId, setPostingId] = useState<string | null>(null);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const navigate = useNavigate();
    const { confirm } = useConfirm();

    const fetchDraftReturns = useCallback(async () => {
        const { data } = await supabase
            .from('sales_returns')
            .select('*, sales(sales_no, customer:customers(name))')
            .eq('status', 'DRAFT')
            .order('created_at', { ascending: false })
        setDrafts(data || [])
    }, []);

    useEffect(() => {
        fetchDraftReturns();
    }, [fetchDraftReturns, refreshTrigger]);

    async function handlePost(retId: string) {
        const ok = await confirm({
            title: "Post Sales Return",
            description: "Confirm POST Return? This handles Stock & Journals.",
            confirmText: "POST",
            cancelText: "Cancel",
            tone: "danger",
        });
        if (!ok) return
        setPostingId(retId)
        try {
            const { error } = await supabase.rpc('rpc_post_sales_return', { p_return_id: retId })
            if (error) throw error
            onSuccess("Return POSTED Successfully!")
            fetchDraftReturns()
        } catch (err: unknown) {
            onError(getErrorMessage(err))
        } finally {
            setPostingId(null)
        }
    }

    async function handleDelete(retId: string) {
        const ok = await confirm({
            title: "Delete Draft Return",
            description: "Delete this draft return? This action cannot be undone.",
            confirmText: "Delete",
            cancelText: "Cancel",
            tone: "danger",
        });
        if (!ok) return
        setDeletingId(retId)
        try {
            const { error } = await supabase
                .from('sales_returns')
                .delete()
                .eq('id', retId)
                .eq('status', 'DRAFT')
            if (error) throw error
            onSuccess("Draft return deleted.")
            fetchDraftReturns()
        } catch (err: unknown) {
            onError(getErrorMessage(err))
        } finally {
            setDeletingId(null)
        }
    }

    return (
        <Card className="sticky top-6">
            <CardHeader className="bg-yellow-50/50 border-b border-yellow-100">
                <CardTitle className="text-yellow-800">Pending Drafts</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
                {drafts.length === 0 ? (
                    <div className="p-6 text-center text-gray-500 italic">No pending drafts</div>
                ) : (
                    <ul className="divide-y divide-gray-100">
                        {drafts.map(d => {
                            const isPosting = postingId === d.id;
                            const isDeleting = deletingId === d.id;
                            const isBusy = isPosting || isDeleting;
                            return (
                            <li key={d.id} className="p-4 hover:bg-gray-50 transition-colors">
                                <div className="flex justify-between items-start mb-2">
                                    <div>
                                        <Badge variant="warning" className="mb-1">DRAFT</Badge>
                                        <div className="text-sm font-medium text-gray-900">{d.sales?.customer?.name}</div>
                                        <div className="text-xs text-gray-500">Ref: {d.sales?.sales_no}</div>
                                        <div className="text-xs text-gray-400">{d.return_date}</div>
                                    </div>
                                </div>
                                <div className="flex gap-2 mt-2">
                                    <Button
                                        size="sm"
                                        variant="primary"
                                        className="flex-1"
                                        onClick={() => handlePost(d.id)}
                                        disabled={isBusy}
                                        icon={<Icons.CheckCircle className="w-4 h-4" />}
                                    >
                                        {isPosting ? "Posting..." : "Post"}
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        className="flex-1"
                                        onClick={() => navigate(`/sales-return?draft=${d.id}`)}
                                        disabled={isBusy}
                                        icon={<Icons.Edit className="w-4 h-4" />}
                                    >
                                        Edit
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        className="flex-1 text-red-600 hover:text-red-700 hover:bg-red-50"
                                        onClick={() => handleDelete(d.id)}
                                        disabled={isBusy}
                                        icon={<Icons.Trash className="w-4 h-4" />}
                                    >
                                        {isDeleting ? "Deleting..." : "Delete"}
                                    </Button>
                                </div>
                            </li>
                            );
                        })}
                    </ul>
                )}
            </CardContent>
        </Card>
    );
}
