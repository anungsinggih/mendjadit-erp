import { useEffect, useState, useCallback } from "react";
import { supabase } from "../supabaseClient";
import { Button } from "./ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/Card";
import { Icons } from "./ui/Icons";
import { StatusBadge } from "./ui/StatusBadge";
import { useNavigate } from "react-router-dom";
import { getErrorMessage } from "../lib/errors";
import { useConfirm } from "./ui/ConfirmDialogContext";

type SalesDraft = {
    id: string;
    sales_date?: string;
    terms?: string;
    customer?: { name?: string };
};

type Props = {
    refreshTrigger: number;
    onSuccess: (msg: string) => void;
    onError: (msg: string) => void;
};

export function SalesDraftList({ refreshTrigger, onSuccess, onError }: Props) {
    const [drafts, setDrafts] = useState<SalesDraft[]>([]);
    const [postingId, setPostingId] = useState<string | null>(null);
    const navigate = useNavigate();
    const { confirm } = useConfirm();

    const fetchDrafts = useCallback(async () => {
        const { data } = await supabase
            .from("sales")
            .select("*, customer:customers(name)")
            .eq("status", "DRAFT")
            .order("created_at", { ascending: false });
        setDrafts(data || []);
    }, []);

    useEffect(() => {
        fetchDrafts();
    }, [fetchDrafts, refreshTrigger]);

    async function handlePost(salesId: string) {
        const ok = await confirm({
            title: "Post Sales Draft",
            description: "Confirm POST? This is irreversible.",
            confirmText: "POST",
            cancelText: "Cancel",
            tone: "danger",
        });
        if (!ok) return;
        setPostingId(salesId);
        try {
            const { error } = await supabase.rpc("rpc_post_sales", {
                p_sales_id: salesId,
            });
            if (error) throw error;
            onSuccess(`Sales POSTED Successfully! Journal Created.`);
            navigate(`/sales/${salesId}`);
        } catch (err: unknown) {
            const message = getErrorMessage(err);
            if (message.includes("ck_stock_nonneg")) {
                onError("FAILED: Insufficient Stock. Please add stock via Purchase or Adjustment first.");
            } else {
                onError(message);
            }
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
            <CardContent className="flex-1 overflow-y-auto p-4 max-h-[600px]">
                {drafts.length === 0 ? (
                    <p className="text-gray-400 text-sm text-center py-10 italic">
                        No pending drafts found.
                    </p>
                ) : (
                    <ul className="space-y-4">
                        {drafts.map((d) => {
                            const isPosting = postingId === d.id;
                            return (
                            <li
                                key={d.id}
                                className="p-4 border border-gray-200 rounded-lg hover:border-blue-300 hover:shadow-md transition-all bg-white group"
                            >
                                <div className="flex justify-between items-start mb-3">
                                    <div>
                                        <div className="font-bold text-gray-900">
                                            {d.customer?.name}
                                        </div>
                                        <div className="text-xs text-gray-500 mt-1 flex gap-2 items-center">
                                            <span className="flex items-center gap-1">
                                                <Icons.Calendar className="w-3 h-3" />{" "}
                                                {d.sales_date}
                                            </span>
                                            <span className="flex items-center gap-1">
                                                <Icons.DollarSign className="w-3 h-3" />{" "}
                                                {d.terms}
                                            </span>
                                        </div>
                                    </div>
                                    <StatusBadge status="DRAFT" />
                                </div>
                                <div className="flex flex-col sm:flex-row gap-3 mt-6">
                                    <Button
                                        type="submit"
                                        onClick={() => handlePost(d.id)}
                                        disabled={isPosting}
                                        className="w-full sm:w-auto min-h-[44px] bg-blue-600 hover:bg-blue-700"
                                        icon={<Icons.Check className="w-4 h-4" />}
                                    >
                                        {isPosting ? "Posting..." : "Post Order"}
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
