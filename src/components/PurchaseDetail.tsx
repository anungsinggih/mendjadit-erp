import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../supabaseClient";
import { useNavigate, useParams } from "react-router-dom";
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
import { PurchaseInvoicePrint } from "./print/PurchaseInvoicePrint";
import { toPng } from "html-to-image";

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

type RelatedDoc = {
  journal_id?: string;
  journal_date?: string;
  ap_bill_id?: string;
  ap_total?: number;
  ap_outstanding?: number;
  ap_status?: string;
  payment_id?: string;
  payment_amount?: number;
};

type InventoryHistoryRow = {
  item_id: string | null;
  item_name: string | null;
  sku: string | null;
  size_name?: string | null;
  color_name?: string | null;
  qty_change: number | null;
  trx_date: string | null;
  ref_no: string | null;
};

type PurchaseReturnSummary = {
  id: string;
  return_date: string;
  total_amount: number;
  status: "DRAFT" | "POSTED" | "VOID";
  return_no?: string | null;
};

type CompanyBank = {
  id: string;
  code: string;
  bank_name: string;
  account_number: string;
  account_holder: string;
  is_active: boolean;
  is_default: boolean;
};

export default function PurchaseDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [purchase, setPurchase] = useState<PurchaseDetail | null>(null);
  const [items, setItems] = useState<PurchaseItem[]>([]);
  const [relatedDocs, setRelatedDocs] = useState<RelatedDoc>({});
  const [returns, setReturns] = useState<PurchaseReturnSummary[]>([]);
  const [inventoryHistory, setInventoryHistory] = useState<InventoryHistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [paymentMethodName, setPaymentMethodName] = useState<string | null>(null);
  const [companyBanks, setCompanyBanks] = useState<CompanyBank[]>([]);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteSuccess, setDeleteSuccess] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);
  const [postSuccess, setPostSuccess] = useState<string | null>(null);
  const [isPosting, setIsPosting] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const printRef = useRef<HTMLDivElement | null>(null);
  const { confirm } = useConfirm();
  const itemsTotal = items.reduce((sum, item) => sum + (item.subtotal || 0), 0);
  const discountAmount = purchase?.discount_amount || 0;
  const computedTotal = itemsTotal - discountAmount;
  const displayTotal = purchase
    ? (discountAmount > 0 && purchase.total_amount >= itemsTotal ? computedTotal : (purchase.total_amount || computedTotal))
    : itemsTotal;

  useEffect(() => {
    if (id) {
      fetchPurchaseDetail(id);
      fetchCompanyBanks();
    }
  }, [id]);

  async function fetchPurchaseDetail(purchaseId: string) {
    setLoading(true);
    setError(null);
    setInventoryHistory([]);

    try {
      // Fetch header
      const { data: purchaseData, error: purchaseError } = await supabase
        .from("purchases")
        .select(
          `
                    id,
                    purchase_date,
                    purchase_no,
                    vendor_id,
                    terms,
                    payment_method_code,
                    total_amount,
                    discount_amount,
                    status,
                    notes,
                    created_at,
                    vendors (
                        name
                    )
                `,
        )
        .eq("id", purchaseId)
        .single();

      if (purchaseError) throw purchaseError;

      setPurchase({
        ...purchaseData,
        vendor_name: (purchaseData.vendors as unknown as { name: string })?.name || "Unknown",
      });

      if (purchaseData.terms === "CASH" && purchaseData.payment_method_code) {
        const { data: methodData } = await supabase
          .from("payment_methods")
          .select("name")
          .eq("code", purchaseData.payment_method_code)
          .single();
        setPaymentMethodName(methodData?.name || purchaseData.payment_method_code);
      } else {
        setPaymentMethodName(null);
      }

      // Fetch items
      const { data: itemsData, error: itemsError } = await supabase
        .from("purchase_items")
        .select(
          `
                    id,
                    item_id,
                    qty,
                    unit_cost,
                    subtotal,
                    uom_snapshot,
                    items (
                        name,
                        sku,
                        sizes ( name ),
                        colors ( name )
                    )
                `,
        )
        .eq("purchase_id", purchaseId);

      if (itemsError) throw itemsError;

      const mappedItems =
        itemsData?.map((item) => ({
          ...item,
          item_name: (item.items as unknown as { name: string })?.name || "Unknown",
          sku: (item.items as unknown as { sku: string })?.sku || "",
          size_name:
            (item.items as unknown as { sizes?: { name: string } })?.sizes?.name ||
            undefined,
          color_name:
            (item.items as unknown as { colors?: { name: string } })?.colors?.name ||
            undefined,
        })) || [];

      const mergedItems = Object.values(
        mappedItems.reduce((acc, item) => {
          const key = `${item.item_id}-${item.unit_cost}`;
          if (!acc[key]) {
            acc[key] = { ...item };
            return acc;
          }
          acc[key].qty += item.qty;
          acc[key].subtotal += item.subtotal;
          return acc;
        }, {} as Record<string, PurchaseItem>),
      );

      setItems(mergedItems);

      // Fetch related documents (only if POSTED)
      if (purchaseData.status === "POSTED") {
        const related: RelatedDoc = {};

        // Journal
        const { data: journalData } = await supabase
          .from("journals")
          .select("id, journal_date")
          .eq("ref_type", "purchase")
          .eq("ref_id", purchaseId)
          .single();

        if (journalData) {
          related.journal_id = journalData.id;
          related.journal_date = journalData.journal_date;
        }

        // AP Bill (if CREDIT)
        if (purchaseData.terms === "CREDIT") {
          const { data: apData } = await supabase
            .from("ap_bills")
            .select("id, total_amount, outstanding_amount, status")
            .eq("purchase_id", purchaseId)
            .single();

          if (apData) {
            related.ap_bill_id = apData.id;
            related.ap_total = apData.total_amount;
            related.ap_outstanding = apData.outstanding_amount;
            related.ap_status = apData.status;
          }
        }

        // Payment (if CASH)
        if (purchaseData.terms === "CASH") {
          const { data: paymentData } = await supabase
            .from("payments")
            .select("id, amount")
            .eq("ref_type", "purchase")
            .eq("ref_id", purchaseId)
            .maybeSingle();

          if (paymentData) {
            related.payment_id = paymentData.id;
            related.payment_amount = paymentData.amount;
          }
        }

        setRelatedDocs(related);

        if (!related.journal_id && purchaseData.purchase_no) {
          const { data: invData, error: invError } = await supabase
            .from("view_stock_card")
            .select("item_id, item_name, sku, qty_change, trx_date, ref_no")
            .eq("trx_type", "PURCHASE")
            .eq("ref_no", purchaseData.purchase_no);
          if (!invError) {
            const baseRows = (invData as InventoryHistoryRow[]) || [];
            const ids = Array.from(
              new Set(baseRows.map((row) => row.item_id).filter(Boolean) as string[]),
            );
            if (ids.length > 0) {
              const { data: itemMeta } = await supabase
                .from("items")
                .select("id, sizes(name), colors(name)")
                .in("id", ids);
              const metaMap = new Map(
                (itemMeta || []).map((row) => [
                  row.id,
                  {
                    size_name:
                      (row.sizes as unknown as { name?: string } | null)?.name || null,
                    color_name:
                      (row.colors as unknown as { name?: string } | null)?.name || null,
                  },
                ]),
              );
              setInventoryHistory(
                baseRows.map((row) => {
                  const meta = metaMap.get(row.item_id || "");
                  return {
                    ...row,
                    size_name: meta?.size_name ?? row.size_name ?? null,
                    color_name: meta?.color_name ?? row.color_name ?? null,
                  };
                }),
              );
            } else {
              setInventoryHistory(baseRows);
            }
          } else {
            setInventoryHistory([]);
          }
        } else {
          setInventoryHistory([]);
        }
      }

      // Fetch returns (all statuses)
      const { data: returnsData, error: returnsError } = await supabase
        .from("purchase_returns")
        .select("id, return_date, total_amount, status, return_no")
        .eq("purchase_id", purchaseId)
        .order("return_date", { ascending: false })
        .order("created_at", { ascending: false });

      if (returnsError) throw returnsError;
      setReturns(
        returnsData?.map((ret) => ({
          ...ret,
          return_no: ret.return_no || ret.id.substring(0, 8),
        })) || [],
      );
    } catch (err: unknown) {
      setError(getErrorMessageLocal(err));
    } finally {
      setLoading(false);
    }
  }

  async function fetchCompanyBanks() {
    const { data } = await supabase
      .from("company_banks")
      .select("*")
      .eq("is_active", true)
      .order("is_default", { ascending: false })
      .order("bank_name", { ascending: true });
    if (data) setCompanyBanks(data);
  }

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
      fetchPurchaseDetail(purchase.id);
    } catch (err: unknown) {
      if (err instanceof Error) setPostError(err.message || "Failed to post purchase");
    } finally {
      setIsPosting(false);
    }
  }

  const downloadFileName = useMemo(() => {
    const docNo = purchase?.purchase_no || purchase?.id || "invoice";
    return `purchase-${docNo}.png`;
  }, [purchase?.id, purchase?.purchase_no]);

  const handleDownloadImage = async () => {
    if (!printRef.current) return;
    setDownloadError(null);
    try {
      const source = printRef.current;
      const clone = source.cloneNode(true) as HTMLDivElement;
      clone.style.position = "fixed";
      clone.style.left = "0";
      clone.style.top = "0";
      clone.style.opacity = "1";
      clone.style.zIndex = "9999";
      clone.style.pointerEvents = "none";
      clone.style.transform = "none";
      clone.style.background = "#ffffff";
      clone.style.width = "794px";
      clone.style.maxWidth = "794px";
      clone.style.height = "auto";
      clone.style.maxHeight = "none";
      document.body.appendChild(clone);
      const captureHeight = Math.max(555, clone.scrollHeight);
      const dataUrl = await toPng(clone, {
        cacheBust: true,
        pixelRatio: 2,
        backgroundColor: "#ffffff",
        skipFonts: true,
        width: 794,
        height: captureHeight,
        filter: (node) => {
          if (node.nodeName === "STYLE") {
            const content = (node as HTMLStyleElement).textContent || "";
            if (content.includes("@page")) return false;
          }
          return true;
        },
        style: {
          visibility: "visible",
          opacity: "1",
          transform: "none",
          position: "static",
          left: "0",
          top: "0",
          zIndex: "auto",
          fontFamily: "Arial, sans-serif",
        },
      });
      document.body.removeChild(clone);
      const link = document.createElement("a");
      link.href = dataUrl;
      link.download = downloadFileName;
      link.click();
    } catch (err) {
      console.error(err);
      if (printRef.current) {
        const clones = Array.from(document.body.querySelectorAll("div"))
          .filter((el) => el.style.zIndex === "9999" && el.style.position === "fixed");
        clones.forEach((el) => el.remove());
      }
      setDownloadError("Gagal download invoice sebagai gambar.");
    }
  };

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
    <div className="w-full space-y-6">
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
            <Button
              onClick={() => window.print()}
              variant="outline"
              icon={<Icons.Printer className="w-4 h-4" />}
            >
              Print
            </Button>
            <Button
              onClick={handleDownloadImage}
              variant="outline"
              icon={<Icons.Image className="w-4 h-4" />}
            >
              Download Image
            </Button>
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
        {(deleteError || deleteSuccess || postError || postSuccess || downloadError) && (
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
            {downloadError && (
              <Alert variant="error" title="Gagal" description={downloadError} />
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

      <div
        ref={printRef}
        className="absolute -left-[99999px] top-0 opacity-0 pointer-events-none print:static print:opacity-100 print:pointer-events-auto"
      >
        <PurchaseInvoicePrint
          data={{
            id: purchase.id,
            purchase_no: purchase.purchase_no,
            purchase_date: purchase.purchase_date,
            vendor_name: purchase.vendor_name,
            terms: purchase.terms,
            total_amount: displayTotal,
            discount_amount: purchase.discount_amount,
            notes: purchase.notes,
            payment_method_code: purchase.payment_method_code
          }}
          items={items}
          company={{
            name: "ZIYADA SPORT",
          }}
          banks={companyBanks}
          visibleOnScreen
        />
      </div>

    </div>
  );
}
