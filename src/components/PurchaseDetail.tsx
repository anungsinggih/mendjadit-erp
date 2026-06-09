import { useState } from "react";
import { supabase } from "../supabaseClient";
import { useNavigate, useParams } from "react-router-dom";
import { usePurchaseDetailQuery, useQueryClient } from "../hooks/useQueries";
import { Button } from "./ui/Button";
import { useConfirm } from "./ui/ConfirmDialogContext";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/Card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/Table";
import { Badge } from "./ui/Badge";
import { Alert } from "./ui/Alert";
import { Icons } from "./ui/Icons";
import { StatusBadge } from "./ui/StatusBadge";
import { formatCurrency, formatDate, safeDocNo } from "../lib/format";
import DocumentHeaderCard from "./shared/DocumentHeaderCard";
import LineItemsTable from "./shared/LineItemsTable";
import RelatedDocumentsCard, { type RelatedDocumentItem } from "./shared/RelatedDocumentsCard";

// Helper for error message if shared util not sufficient or local override needed
const getErrorMessageLocal = (error: unknown) => {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error !== null) {
    const err = error as { message?: string };
    return err.message || JSON.stringify(error);
  }
  return String(error);
};

type PurchaseDetail = {
  id: string;
  purchase_date: string;
  purchase_no: string | null;
  vendor_id: string;
  vendor_name: string;
  terms: "CASH" | "CREDIT";
  payment_method_code?: string | null;
  total_amount: number;
  discount_amount?: number | null;
  status: "DRAFT" | "POSTED" | "VOID";
  notes: string | null;
  created_at: string;
};

type PurchaseItem = {
  id: string;
  item_id: string;
  item_name: string;
  sku: string;
  size_name?: string;
  color_name?: string;
  uom_snapshot: string;
  qty: number;
  unit_cost: number;
  subtotal: number;
};

export default function PurchaseDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // --- React Query for all detail data ---
  const { data: detailData, isLoading: loading, error: fetchError, refetch } = usePurchaseDetailQuery(id);
  const purchase = detailData?.purchase ?? null;
  const items = detailData?.items ?? [];
  const relatedDocs = detailData?.relatedDocs ?? {};
  const returns = detailData?.returns ?? [];
  const inventoryHistory = detailData?.inventoryHistory ?? [];
  const paymentMethodName = detailData?.paymentMethodName ?? null;
  const error = fetchError ? getErrorMessageLocal(fetchError) : null;

  // --- Company banks (separate, lightweight) ---

  // --- Action state (unchanged) ---
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteSuccess, setDeleteSuccess] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);
  const [postSuccess, setPostSuccess] = useState<string | null>(null);
  const [isPosting, setIsPosting] = useState(false);
  const { confirm } = useConfirm();
  const itemsTotal = items.reduce((sum, item) => sum + (item.subtotal || 0), 0);
  const discountAmount = purchase?.discount_amount || 0;
  const computedTotal = itemsTotal - discountAmount;
  const displayTotal = purchase
    ? (discountAmount > 0 && purchase.total_amount >= itemsTotal ? computedTotal : (purchase.total_amount || computedTotal))
    : itemsTotal;


  async function handleDeleteDraft() {
    if (!purchase) return;
    const ok = await confirm({
      title: "Delete Draft Purchase",
      description: "Hapus draft ini? Tindakan ini tidak bisa dibatalkan.",
      confirmText: "Delete",
      cancelText: "Cancel",
      tone: "danger",
    });
    if (!ok) return;

    setIsDeleting(true);
    setDeleteError(null);
    try {
      const { error } = await supabase.rpc("rpc_delete_purchase_draft", {
        p_purchase_id: purchase.id,
      });
      if (error) throw error;
      setDeleteSuccess("Draft berhasil dihapus, kembali ke daftar...");
      queryClient.invalidateQueries({ queryKey: ["purchase-history"] });
      setTimeout(() => navigate("/purchases/history"), 700);
    } catch (err: unknown) {
      if (err instanceof Error) setDeleteError(err.message);
    } finally {
      setIsDeleting(false);
    }
  }

  async function handlePost() {
    if (!purchase) return;
    const ok = await confirm({
      title: "Post Purchase",
      description: "Are you sure you want to POST this purchase? This action cannot be undone.",
      confirmText: "POST",
      cancelText: "Cancel",
      tone: "danger",
    });
    if (!ok) return;

    setIsPosting(true);
    setPostError(null);
    setPostSuccess(null);

    try {
      const { data, error: rpcError } = await supabase.rpc("rpc_post_purchase", {
        p_purchase_id: purchase.id,
      });

      if (rpcError) {
        if (rpcError.message?.includes("CLOSED")) {
          throw new Error("Cannot POST: Period is CLOSED for this date");
        } else {
          throw rpcError;
        }
      }

      const journalSkipped =
        (data as { journal_skipped?: boolean } | null | undefined)?.journal_skipped ??
        (Array.isArray(data) ? (data[0] as { journal_skipped?: boolean } | undefined)?.journal_skipped : undefined);
      setPostSuccess(
        journalSkipped
          ? "Purchase posted. Journal skipped (total 0 untuk FINISHED_GOOD)."
          : "Purchase posted successfully!"
      );
      queryClient.invalidateQueries({ queryKey: ["purchase-history"] });
      refetch();
    } catch (err: unknown) {
      if (err instanceof Error) setPostError(err.message || "Failed to post purchase");
    } finally {
      setIsPosting(false);
    }
  }

  if (loading) {
    return (
      <div className="w-full p-8 text-center">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
        <p className="mt-2 text-gray-600">Loading purchase detail...</p>
      </div>
    );
  }

  if (error || !purchase) {
    return (
      <div className="w-full p-8">
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-md flex items-center gap-2">
          <Icons.Warning className="w-5 h-5 flex-shrink-0" />{" "}
          {error || "Purchase not found"}
        </div>
        <Button
          onClick={() => navigate("/purchases/history")}
          className="mt-4"
          icon={<Icons.ArrowLeft className="w-4 h-4" />}
        >
          Back to List
        </Button>
      </div>
    );
  }

  const headerFields = [
    {
      label: "Date",
      value: formatDate(purchase.purchase_date),
    },
    {
      label: "Vendor",
      value: purchase.vendor_name,
    },
    {
      label: "Terms",
      value: (
        <Badge
          className={
            purchase.terms === "CASH"
              ? "bg-blue-100 text-blue-800"
              : "bg-orange-100 text-orange-800"
          }
        >
          {purchase.terms}
        </Badge>
      ),
    },
    ...(purchase.terms === "CASH"
      ? [
        {
          label: "Payment Method",
          value: paymentMethodName || purchase.payment_method_code || "-",
        },
      ]
      : []),
    ...(purchase.discount_amount && purchase.discount_amount > 0
      ? [
        {
          label: "Diskon",
          value: formatCurrency(purchase.discount_amount),
        },
      ]
      : []),
    {
      label: "Total",
      value: <span className="font-bold text-lg">{formatCurrency(displayTotal)}</span>,
    },
  ];

  const lineItemColumns = [
    {
      label: "SKU",
      cellClassName: "font-mono text-sm",
      render: (item: PurchaseItem) => item.sku,
    },
    {
      label: "Item Name",
      render: (item: PurchaseItem) => item.item_name,
    },
    {
      label: "Size",
      cellClassName: "text-sm text-gray-600",
      render: (item: PurchaseItem) => item.size_name || '-',
    },
    {
      label: "Color",
      cellClassName: "text-sm text-gray-600",
      render: (item: PurchaseItem) => item.color_name || '-',
    },
    {
      label: "UoM",
      render: (item: PurchaseItem) => item.uom_snapshot,
    },
    {
      label: "Qty",
      headerClassName: "text-right",
      cellClassName: "text-right",
      render: (item: PurchaseItem) => item.qty,
    },
    {
      label: "Unit Cost",
      headerClassName: "text-right",
      cellClassName: "text-right",
      render: (item: PurchaseItem) => formatCurrency(item.unit_cost),
    },
    {
      label: "Subtotal",
      headerClassName: "text-right",
      cellClassName: "text-right font-medium",
      render: (item: PurchaseItem) => formatCurrency(item.subtotal),
    },
  ];



  const relatedItems: RelatedDocumentItem[] = [];
  if (purchase.status === "POSTED") {
    if (relatedDocs.journal_id) {
      relatedItems.push({
        id: relatedDocs.journal_id,
        title: "Journal Entry",
        description: (
          <p>
            ID: {relatedDocs.journal_id.substring(0, 8)} | Date:{" "}
            {formatDate(relatedDocs.journal_date)}
          </p>
        ),
        icon: <Icons.FileText className="w-5 h-5" />,
        toneClassName: "bg-blue-50",
        iconClassName: "text-blue-500",
        actionLabel: "Open",
        onAction: () =>
          navigate(
            `/journals?q=${encodeURIComponent(
              purchase.purchase_no || relatedDocs.journal_id!
            )}`
          ),
      });
    }
    if (relatedDocs.ap_bill_id) {
      relatedItems.push({
        id: relatedDocs.ap_bill_id,
        title: "AP Bill (CREDIT)",
        description: (
          <p>
            ID: {relatedDocs.ap_bill_id.substring(0, 8)} | Total:{" "}
            {formatCurrency(relatedDocs.ap_total!)} | Outstanding:{" "}
            {formatCurrency(relatedDocs.ap_outstanding!)} | Status:{" "}
            <Badge className="ml-1">{relatedDocs.ap_status}</Badge>
          </p>
        ),
        icon: <Icons.FileText className="w-5 h-5" />,
        toneClassName: "bg-orange-50",
        iconClassName: "text-orange-500",
        actionLabel: "Open AP",
        onAction: () =>
          navigate(
            `/finance?ap=${encodeURIComponent(relatedDocs.ap_bill_id!)}`
          ),
      });
    }
    if (relatedDocs.payment_id) {
      relatedItems.push({
        id: relatedDocs.payment_id,
        title: "Payment (CASH)",
        description: (
          <p>
            ID: {relatedDocs.payment_id.substring(0, 8)} | Amount:{" "}
            {formatCurrency(relatedDocs.payment_amount!)}
          </p>
        ),
        icon: <Icons.DollarSign className="w-5 h-5" />,
        toneClassName: "bg-green-50",
        iconClassName: "text-green-500",
      });
    }
    if (!relatedDocs.journal_id && inventoryHistory.length > 0) {
      relatedItems.push({
        id: `inv-${purchase.id}`,
        title: "Inventory History (FG)",
        description: (
          <div className="space-y-1">
            <p>Stock masuk tercatat di inventory.</p>
            <ul className="text-xs text-gray-500 space-y-0.5">
              {inventoryHistory.slice(0, 3).map((row) => {
                const variant = [row.size_name, row.color_name].filter(Boolean).join(" • ");
                return (
                  <li key={`${row.item_id}-${row.sku}`}>
                    {row.sku} {row.item_name}
                    {variant ? ` (${variant})` : ""} (+{row.qty_change || 0})
                  </li>
                );
              })}
              {inventoryHistory.length > 3 && (
                <li>+{inventoryHistory.length - 3} items lainnya</li>
              )}
            </ul>
          </div>
        ),
        icon: <Icons.Package className="w-5 h-5" />,
        toneClassName: "bg-slate-50",
        iconClassName: "text-slate-600",
      });
    }
  }

  return (
    <div className="w-full space-y-6 print:space-y-0">
      <div className="flex flex-col gap-3 print:hidden">
        <div className="flex justify-between items-center">
          <h2 className="text-3xl font-bold tracking-tight text-gray-900">
            Purchase Detail
          </h2>
          <div className="flex gap-2 no-print flex-wrap">
            {/* Register Payment Action */}
            {purchase.status === "POSTED" &&
              purchase.terms === "CREDIT" &&
              relatedDocs.ap_status !== "PAID" && (
                <Button
                  variant="success"
                  onClick={() => {
                    if (relatedDocs.ap_bill_id) {
                      navigate(`/finance?ap=${relatedDocs.ap_bill_id}`);
                    }
                  }}
                  icon={<Icons.DollarSign className="w-4 h-4" />}
                >
                  Register Payment
                </Button>
              )}
            {purchase.status === "POSTED" && (
              <Button
                onClick={() => navigate(`/purchase-return?purchase=${purchase.id}`)}
                variant="primary"
                icon={<Icons.Plus className="w-4 h-4" />}
              >
                Create Return
              </Button>
            )}
            <Button
              onClick={() => navigate("/purchases/history")}
              variant="outline"
              icon={<Icons.ArrowLeft className="w-4 h-4" />}
            >
              Back to List
            </Button>
            {purchase.status === "DRAFT" && (
              <Button
                onClick={handlePost}
                disabled={isPosting}
                isLoading={isPosting}
                variant="success"
                icon={<Icons.Check className="w-4 h-4" />}
              >
                POST
              </Button>
            )}
            {purchase.status === "DRAFT" && (
              <Button
                onClick={() => navigate(`/purchases/${purchase.id}/edit`)}
                variant="primary"
                icon={<Icons.Edit className="w-4 h-4" />}
              >
                Edit
              </Button>
            )}
            {purchase.status === "DRAFT" && (
              <Button
                variant="danger"
                onClick={handleDeleteDraft}
                isLoading={isDeleting}
                disabled={isDeleting}
              >
                Delete Draft
              </Button>
            )}
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 bg-white border border-slate-200 rounded-lg p-4">
          <div className="space-y-1">
            <p className="text-[11px] uppercase tracking-wide text-slate-500">Doc No</p>
            <p className="font-semibold text-slate-900">{purchase.purchase_no || purchase.id.substring(0, 8)}</p>
          </div>
          <div className="space-y-1">
            <p className="text-[11px] uppercase tracking-wide text-slate-500">Status</p>
            <div>
              <Badge className={purchase.status === "POSTED" ? "bg-green-100 text-green-800" : purchase.status === "DRAFT" ? "bg-gray-100 text-gray-800" : "bg-red-100 text-red-800"}>
                {purchase.status}
              </Badge>
            </div>
          </div>
          <div className="space-y-1">
            <p className="text-[11px] uppercase tracking-wide text-slate-500">Date</p>
            <p className="font-semibold text-slate-900">
              {new Date(purchase.purchase_date).toLocaleDateString("id-ID")}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-[11px] uppercase tracking-wide text-slate-500">Vendor</p>
            <p className="font-semibold text-slate-900">{purchase.vendor_name}</p>
          </div>
          <div className="space-y-1 md:text-right">
            <p className="text-[11px] uppercase tracking-wide text-slate-500">Total</p>
            <p className="font-semibold text-slate-900">{formatCurrency(displayTotal)}</p>
          </div>
        </div>
        {(deleteError || deleteSuccess || postError || postSuccess ) && (
          <div className="w-full">
            {postError && (
              <Alert variant="error" title="Gagal" description={postError} />
            )}
            {postSuccess && (
              <Alert
                variant="success"
                title="Berhasil"
                description={postSuccess}
              />
            )}
            {deleteError && (
              <Alert variant="error" title="Gagal" description={deleteError} />
            )}
            {deleteSuccess && (
              <Alert
                variant="success"
                title="Berhasil"
                description={deleteSuccess}
              />
            )}
          </div>
        )}
      </div>



      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 print:hidden">
        <div className="xl:col-span-2 space-y-6">
          <DocumentHeaderCard
            title="Purchase Document"
            docNo={safeDocNo(purchase.purchase_no, purchase.id, true)}
            status={purchase.status}
            fields={headerFields}
            notes={purchase.notes}
          />

          <LineItemsTable
            rows={items}
            columns={lineItemColumns}
            totalValue={formatCurrency(displayTotal)}
            emptyLabel="No items added"
          />
        </div>

        <div className="xl:col-span-1 space-y-6">
          <div className="xl:sticky xl:top-6 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Items Subtotal</span>
                  <span className="font-medium">{formatCurrency(itemsTotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Diskon</span>
                  <span className="font-medium text-red-600">-{formatCurrency(purchase.discount_amount || 0)}</span>
                </div>
                <div className="flex justify-between border-t pt-3">
                  <span className="text-gray-700 font-semibold">Total</span>
                  <span className="font-bold">{formatCurrency(displayTotal)}</span>
                </div>
                <div className="pt-2 border-t">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Terms</span>
                    <span className="font-medium">{purchase.terms}</span>
                  </div>
                  {purchase.terms === "CASH" && (
                    <div className="flex justify-between">
                      <span className="text-gray-500">Payment</span>
                      <span className="font-medium">{paymentMethodName || purchase.payment_method_code || "-"}</span>
                    </div>
                  )}
                  {purchase.terms === "CREDIT" && relatedDocs.ap_outstanding != null && (
                    <div className="flex justify-between">
                      <span className="text-gray-500">Outstanding</span>
                      <span className="font-semibold text-amber-600">
                        {formatCurrency(relatedDocs.ap_outstanding)}
                      </span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {Array.isArray(returns) && returns.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Returns</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Return No</TableHead>
                          <TableHead className="text-right">Total</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Action</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {returns.map((ret) => {
                          const returnNo = ret.return_no || safeDocNo(null, ret.id);
                          return (
                            <TableRow key={ret.id}>
                              <TableCell>{formatDate(ret.return_date)}</TableCell>
                              <TableCell className="font-mono text-sm">{returnNo}</TableCell>
                              <TableCell className="text-right font-medium">
                                {formatCurrency(ret.total_amount)}
                              </TableCell>
                              <TableCell>
                                <StatusBadge status={ret.status} />
                              </TableCell>
                              <TableCell className="text-right">
                                <Button
                                  size="icon"
                                  variant="outline"
                                  onClick={() => navigate(`/purchase-returns/${ret.id}`)}
                                  icon={<Icons.Eye className="w-4 h-4" />}
                                  aria-label="View Return"
                                  title="View"
                                />
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            )}

            {purchase.status === "POSTED" && (
              <RelatedDocumentsCard items={relatedItems} />
            )}
          </div>
        </div>
      </div>



    </div>
  );
}
