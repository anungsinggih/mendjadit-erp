import { useState } from "react";
import { supabase } from "../supabaseClient";
import { useNavigate, useParams } from "react-router-dom";
import { usePurchaseDetailQuery, useQueryClient } from "../hooks/useQueries";
import { Button } from "./ui/Button";
import { PageHeader } from "./ui/PageHeader";
import { useConfirm } from "./ui/ConfirmDialogContext";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/Card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/Table";
import { Badge } from "./ui/Badge";
import { Alert } from "./ui/Alert";
import { Icons } from "./ui/Icons";
import { Input } from "./ui/Input";
import { Combobox } from "./ui/Combobox";
import { Dialog, DialogHeader, DialogTitle, DialogContent, DialogFooter } from "./ui/Dialog";
import { PurchaseInvoicePrint } from "./print/PurchaseInvoicePrint";
import { StatusBadge } from "./ui/StatusBadge";
import { formatCurrency, formatDate, safeDocNo } from "../lib/format";
import DocumentHeaderCard from "./shared/DocumentHeaderCard";
import LineItemsTable from "./shared/LineItemsTable";
import RelatedDocumentsCard, { type RelatedDocumentItem } from "./shared/RelatedDocumentsCard";
import { PurchaseReturnForm } from "./PurchaseReturnForm";

const getErrorMessageLocal = (error: unknown) => {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error !== null) {
    const err = error as { message?: string };
    return err.message || JSON.stringify(error);
  }
  return String(error);
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

  const { data: detailData, isLoading: loading, error: fetchError, refetch } = usePurchaseDetailQuery(id);
  const purchase = detailData?.purchase ?? null;
  const items = detailData?.items ?? [];
  const relatedDocs = detailData?.relatedDocs ?? {};
  const returns = detailData?.returns ?? [];
  const inventoryHistory = detailData?.inventoryHistory ?? [];
  const paymentMethodName = detailData?.paymentMethodName ?? null;
  const error = fetchError ? getErrorMessageLocal(fetchError) : null;

  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteSuccess, setDeleteSuccess] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);
  const [postSuccess, setPostSuccess] = useState<string | null>(null);
  const [isPosting, setIsPosting] = useState(false);
  const [isDPModalOpen, setIsDPModalOpen] = useState(false);
  const [isReturnModalOpen, setIsReturnModalOpen] = useState(false);
  const [dpDate, setDpDate] = useState(new Date().toISOString().split("T")[0]);
  const [dpAmount, setDpAmount] = useState<number>(0);
  const [dpAccountId, setDpAccountId] = useState("");
  const [dpNotes, setDpNotes] = useState("");
  const [dpLoading, setDpLoading] = useState(false);
  const [cashBankAccounts, setCashBankAccounts] = useState<Array<{id: string, name: string, code: string}>>([]);
  const { confirm } = useConfirm();

  async function handleOpenDPModal() {
    if (relatedDocs.dp_journals && relatedDocs.dp_journals.length > 0) return;
    try {
      const { data, error } = await supabase
        .from("accounts")
        .select("id, name, code")
        .in("account_type", ["ASSET"])
        .order("code");
      if (error) throw error;
      setCashBankAccounts(data.filter((a: { code: string }) => a.code.startsWith("11")));
      setIsDPModalOpen(true);
    } catch (err) {
      console.error(err);
    }
  }

  async function handleSubmitDP() {
    if (!purchase || dpAmount <= 0 || !dpAccountId) return;
    setDpLoading(true);
    try {
      const { error } = await supabase.rpc("rpc_create_purchase_down_payment", {
        p_purchase_id: purchase.id,
        p_journal_date: dpDate,
        p_amount: dpAmount,
        p_payment_account_id: dpAccountId,
        p_notes: dpNotes || null
      });
      if (error) throw error;
      setPostSuccess("DP Journal created successfully.");
      setIsDPModalOpen(false);
      refetch();
    } catch (err: unknown) {
      if (err instanceof Error) setPostError(err.message || "Failed to create DP");
    } finally {
      setDpLoading(false);
    }
  }

  const itemsTotal = items.reduce((sum, item) => sum + (item.subtotal || 0), 0);
  const discountAmount = purchase?.discount_amount || 0;
  const computedTotal = itemsTotal - discountAmount;
  const displayTotal = purchase
    ? (discountAmount > 0 && purchase.total_amount >= itemsTotal ? computedTotal : (purchase.total_amount || computedTotal))
    : itemsTotal;

  const dpTotal = (relatedDocs.dp_journals || []).reduce((sum, dp) => sum + (dp.amount || 0), 0);
  const paidAmount = purchase?.terms === "CASH"
    ? (relatedDocs.payment_amount || 0)
    : (relatedDocs.ap_total != null && relatedDocs.ap_outstanding != null ? (relatedDocs.ap_total - relatedDocs.ap_outstanding) : 0);

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

    const summaryContent = (
      <div className="space-y-3 text-sm pt-2">
        <div className="p-3 bg-slate-50 rounded border border-slate-100 space-y-1">
          <div className="flex justify-between">
            <span className="text-gray-500">Total Purchase:</span>
            <span className="font-semibold">{formatCurrency(displayTotal)}</span>
          </div>
          {dpTotal > 0 && (
            <div className="flex justify-between text-indigo-600 font-medium">
              <span>DP Terbayar:</span>
              <span>-{formatCurrency(dpTotal)}</span>
            </div>
          )}
          <div className="flex justify-between border-t pt-1 mt-1 font-bold text-slate-900">
            <span>Sisa {purchase.terms === 'CASH' ? 'Bayar' : 'Hutang'}:</span>
            <span>{formatCurrency(Math.max(0, displayTotal - dpTotal))}</span>
          </div>
        </div>
        <div className="text-xs text-amber-600 bg-amber-50 p-2 rounded border border-amber-100 italic">
          Are you sure you want to POST? This action will update inventory and create ledger entries.
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
    if (!ok) return;

    setIsPosting(true);
    setPostError(null);
    setPostSuccess(null);

    try {
      const { error: rpcError } = await supabase.rpc("rpc_post_purchase", {
        p_purchase_id: purchase.id,
      });

      if (rpcError) {
        if (rpcError.message?.includes("CLOSED")) {
          throw new Error("Cannot POST: Period is CLOSED for this date");
        } else {
          throw rpcError;
        }
      }

      setPostSuccess("Purchase posted successfully!");
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

  if (relatedDocs.dp_journals && relatedDocs.dp_journals.length > 0) {
    relatedDocs.dp_journals.forEach((dp) => {
      relatedItems.push({
        id: dp.id,
        title: "Down Payment",
        description: (
          <p>
            Doc No: {purchase.purchase_no || dp.id.substring(0, 8)} | Amount:{" "}
            {formatCurrency(dp.amount)} | Date: {formatDate(dp.journal_date)}
          </p>
        ),
        icon: <Icons.DollarSign className="w-5 h-5" />,
        toneClassName: "bg-indigo-50",
        iconClassName: "text-indigo-500",
        actionLabel: "View DP",
        onAction: () =>
          navigate(
            `/journals?q=${encodeURIComponent(dp.id)}`
          ),
      });
    });
  }

  if (purchase.status === "POSTED") {
    if (relatedDocs.journal_id) {
      relatedItems.push({
        id: relatedDocs.journal_id,
        title: "Journal Entry",
        description: (
          <p>
            Doc No: {relatedDocs.journal_id.substring(0, 8)} | Date:{" "}
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
            Doc No: {purchase.purchase_no || relatedDocs.ap_bill_id.substring(0, 8)} | Total:{" "}
            {formatCurrency(relatedDocs.ap_total!)} | Outstanding:{" "}
            {formatCurrency(relatedDocs.ap_outstanding!)} | Status:{" "}
            <Badge className="ml-1">{relatedDocs.ap_status}</Badge>
          </p>
        ),
        icon: <Icons.FileText className="w-5 h-5" />,
        toneClassName: "bg-orange-50",
        iconClassName: "text-orange-500",
        actionLabel: relatedDocs.ap_status === "PAID" ? "Open Journal" : "Open AP",
        onAction: () =>
          relatedDocs.ap_status === "PAID"
            ? navigate(
              `/journals?q=${encodeURIComponent(
                purchase.purchase_no || relatedDocs.ap_bill_id!
              )}`
            )
            : navigate(
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
            Doc No: {relatedDocs.payment_id.substring(0, 8)} | Amount:{" "}
            {formatCurrency(relatedDocs.payment_amount!)}
          </p>
        ),
        icon: <Icons.DollarSign className="w-5 h-5" />,
        toneClassName: "bg-green-50",
        iconClassName: "text-green-500",
      });
    }

    if (relatedDocs.ap_payments && relatedDocs.ap_payments.length > 0) {
      relatedDocs.ap_payments.forEach((p) => {
        relatedItems.push({
          id: p.id,
          title: "AP Payment",
          description: (
            <p>
              Doc No: {p.payment_no || p.id.substring(0, 8)} | Amount:{" "}
              {formatCurrency(p.amount)} | Date: {formatDate(p.payment_date)}
            </p>
          ),
          icon: <Icons.DollarSign className="w-5 h-5" />,
          toneClassName: "bg-green-50",
          iconClassName: "text-green-500",
          actionLabel: "View Payment",
          onAction: () =>
            navigate(
              `/journals?q=${encodeURIComponent(p.payment_no || p.id)}`
            ),
        });
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
        <PageHeader
          title="Purchase Detail"
          description={`Document: ${purchase.purchase_no || purchase.id.substring(0, 8)}`}
          breadcrumbs={[
            { label: "Purchase History", href: "/purchases/history" },
            { label: "Detail" }
          ]}
          actions={
            <div className="flex gap-2 no-print flex-wrap">
              {purchase.status === "POSTED" &&
                purchase.terms === "CREDIT" &&
                relatedDocs.ap_status !== "PAID" && (
                  <Button
                    variant="success"
                    onClick={() => {
                      if (relatedDocs.ap_bill_id) {
                        navigate(`/finance?ap=${purchase.purchase_no || relatedDocs.ap_bill_id}`);
                      }
                    }}
                    icon={<Icons.DollarSign className="w-4 h-4" />}
                  >
                    Register Payment
                  </Button>
                )}
              {purchase.status === "POSTED" && (
                <Button
                  onClick={() => setIsReturnModalOpen(true)}
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
                  onClick={() => window.print()}
                  variant="outline"
                  icon={<Icons.Printer className="w-4 h-4" />}
                >
                  Print PO
                </Button>
              )}
              {purchase.status === "DRAFT" && (!relatedDocs.dp_journals || relatedDocs.dp_journals.length === 0) && (
                <Button
                  onClick={handleOpenDPModal}
                  variant="outline"
                  icon={<Icons.DollarSign className="w-4 h-4" />}
                >
                  Bayar DP
                </Button>
              )}
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
              {purchase.status === "DRAFT" && (!relatedDocs.dp_journals || relatedDocs.dp_journals.length === 0) && (
                <Button
                  onClick={() => navigate(`/purchases/${purchase.id}/edit`)}
                  variant="primary"
                  icon={<Icons.Edit className="w-4 h-4" />}
                >
                  Edit
                </Button>
              )}
              {purchase.status === "DRAFT" && (!relatedDocs.dp_journals || relatedDocs.dp_journals.length === 0) && (
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
          }
        />
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
                  {dpTotal > 0 && (
                    <div className="flex justify-between">
                      <span className="text-gray-500">DP Terbayar</span>
                      <span className="font-medium text-indigo-600">{formatCurrency(dpTotal)}</span>
                    </div>
                  )}
                  {paidAmount > 0 && (
                    <div className="flex justify-between">
                      <span className="text-gray-500">Pembayaran</span>
                      <span className="font-medium text-green-600">{formatCurrency(paidAmount)}</span>
                    </div>
                  )}
                  {purchase.terms === "CREDIT" && relatedDocs.ap_outstanding != null && (
                    <div className="flex justify-between border-t mt-1 pt-1">
                      <span className="text-gray-700 font-semibold">Sisa Tagihan</span>
                      <span className="font-bold text-amber-600">
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

            {relatedItems.length > 0 && (
              <RelatedDocumentsCard items={relatedItems} />
            )}
          </div>
        </div>
      </div>

      <Dialog isOpen={isReturnModalOpen} onClose={() => setIsReturnModalOpen(false)}>
        <DialogHeader>
          <DialogTitle>Create Purchase Return</DialogTitle>
        </DialogHeader>
        <DialogContent>
          <PurchaseReturnForm
            embedded
            initialPurchaseId={purchase.id}
            onSuccess={(msg) => setPostSuccess(msg)}
            onError={(msg) => setPostError(msg)}
            onSaved={() => {
              setIsReturnModalOpen(false);
              refetch();
            }}
            onCancel={() => setIsReturnModalOpen(false)}
          />
        </DialogContent>
      </Dialog>

      <Dialog isOpen={isDPModalOpen} onClose={() => !dpLoading && setIsDPModalOpen(false)}>
        <DialogHeader>
          <DialogTitle>Bayar Down Payment (DP)</DialogTitle>
        </DialogHeader>
        <DialogContent>
        <div className="space-y-4">
          <Input
            label="Date"
            type="date"
            value={dpDate}
            onChange={(e) => setDpDate(e.target.value)}
            disabled={dpLoading}
          />
          <Input
            label="Nominal DP"
            type="number"
            value={dpAmount || ""}
            onChange={(e) => setDpAmount(Number(e.target.value))}
            disabled={dpLoading}
          />
          <Combobox
            label="Payment Account"
            value={dpAccountId}
            onChange={(val) => setDpAccountId(val)}
            placeholder="Pilih Akun Kas/Bank"
            options={cashBankAccounts.map((a) => ({ label: `${a.code} - ${a.name}`, value: a.id }))}
          />
          <Input
            label="Notes"
            value={dpNotes}
            onChange={(e) => setDpNotes(e.target.value)}
            placeholder="Auto-generated by system"
            disabled={true}
          />
        </div>
        </DialogContent>
        <DialogFooter>
          <Button variant="outline" onClick={() => setIsDPModalOpen(false)} disabled={dpLoading}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSubmitDP} isLoading={dpLoading}>
            Submit DP
          </Button>
        </DialogFooter>
      </Dialog>

      {purchase.status === "DRAFT" && (
        <PurchaseInvoicePrint
          data={{
            id: purchase.id,
            purchase_no: purchase.purchase_no,
            purchase_date: purchase.purchase_date,
            vendor_name: purchase.vendor_name,
            terms: purchase.terms,
            total_amount: displayTotal,
            discount_amount: purchase.discount_amount,
            dp_amount: dpTotal,
            notes: purchase.notes,
            payment_method_code: purchase.payment_method_code,
          }}
          items={items.map((item) => ({
            id: item.item_id,
            item_name: item.item_name,
            size_name: item.size_name,
            color_name: item.color_name,
            unit_cost: item.unit_cost,
            qty: item.qty,
            subtotal: item.subtotal,
          }))}
          company={null}
          visibleOnScreen={false}
          mode="print"
        />
      )}

    </div>
  );
}