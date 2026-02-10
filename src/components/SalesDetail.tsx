import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../supabaseClient";
import { useNavigate, useParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/Card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./ui/Table";
import { Button } from "./ui/Button";
import { useConfirm } from "./ui/ConfirmDialogContext";
import { Badge } from "./ui/Badge";
import { CustomerBadge } from "./ui/CustomerBadge";
import { Alert } from "./ui/Alert";
import { Icons } from "./ui/Icons";
import RelatedDocumentsCard, { type RelatedDocumentItem } from "./shared/RelatedDocumentsCard";
import { SalesInvoicePrint } from "./print/SalesInvoicePrint";
import { getErrorMessage } from "../lib/errors";
import { formatDate, safeDocNo } from "../lib/format";
import { toPng } from "html-to-image";

type SalesDetail = {
  id: string;
  sales_date: string;
  sales_no: string | null;
  customer_id: string;
  customer_name: string;
  customer_type: string;
  terms: "CASH" | "CREDIT";
  payment_method_code?: string | null;
  total_amount: number;
  shipping_fee?: number | null;
  discount_amount?: number | null;
  status: "DRAFT" | "POSTED" | "VOID";
  notes: string | null;
  created_at: string;
};

type SalesItem = {
  id: string;
  item_id: string;
  item_name: string;
  sku: string;
  size_name?: string;
  color_name?: string;
  uom_snapshot: string;
  qty: number;
  unit_price: number;
  subtotal: number;
};

type RelatedDoc = {
  journal_id?: string;
  journal_date?: string;
  receipt_id?: string;
  receipt_amount?: number;
  ar_invoice_id?: string;
  ar_total?: number;
  ar_outstanding?: number;
  ar_status?: string;
};

type SalesReturnSummary = {
  id: string;
  return_date: string;
  total_amount: number;
  status: "DRAFT" | "POSTED" | "VOID";
  return_no?: string | null;
};

type CompanyProfile = {
  name: string;
  address: string;
  phone: string;
  email: string;
  bank_name: string;
  bank_account: string;
  bank_holder: string;
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

export default function SalesDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [sale, setSale] = useState<SalesDetail | null>(null);
  const [items, setItems] = useState<SalesItem[]>([]);
  const [relatedDocs, setRelatedDocs] = useState<RelatedDoc>({});
  const [returns, setReturns] = useState<SalesReturnSummary[]>([]);
  const [company, setCompany] = useState<CompanyProfile | null>(null);
  const [companyBanks, setCompanyBanks] = useState<CompanyBank[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteSuccess, setDeleteSuccess] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);
  const [postSuccess, setPostSuccess] = useState<string | null>(null);
  const [isPosting, setIsPosting] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const printRef = useRef<HTMLDivElement | null>(null);
  const { confirm } = useConfirm();
  const itemsTotal = useMemo(
    () => items.reduce((sum, item) => sum + (item.subtotal || 0), 0),
    [items],
  );
  const computedTotal = itemsTotal + (sale?.shipping_fee || 0) - (sale?.discount_amount || 0);
  const displayTotal =
    sale?.status === "DRAFT"
      ? computedTotal
      : (sale?.total_amount ?? computedTotal);

  useEffect(() => {
    if (id) {
      fetchSaleDetail(id);
      fetchCompanyProfile();
      fetchCompanyBanks();
    }
  }, [id]);

  async function fetchSaleDetail(saleId: string) {
    setLoading(true);
    setError(null);

    try {
      // Fetch header
      const { data: saleData, error: saleError } = await supabase
        .from("sales")
        .select(
          `
                    id,
                    sales_date,
                    sales_no,
                    customer_id,
                    terms,
                    payment_method_code,
                    total_amount,
                    shipping_fee,
                    discount_amount,
                    status,
                    notes,
                    created_at,
                    customers (
                        name,
                        customer_type
                    )
                `,
        )
        .eq("id", saleId)
        .single();

      if (saleError) throw saleError;

      setSale({
        ...saleData,
        customer_name: (saleData.customers as unknown as { name: string })?.name || "Unknown",
        customer_type: (saleData.customers as unknown as { customer_type: string })?.customer_type || "UMUM",
      });

      // payment method label not needed in print layout

      // Fetch items
      const { data: itemsData, error: itemsError } = await supabase
        .from("sales_items")
        .select(
          `
                    id,
                    item_id,
                    qty,
                    unit_price,
                    subtotal,
                    uom_snapshot,
                    items (
                        name,
                        sku,
                        price_default,
                        price_khusus,
                        sizes ( name ),
                        colors ( name )
                    )
                `,
        )
        .eq("sales_id", saleId);

      if (itemsError) throw itemsError;

      let customPriceMap: Record<string, number> = {};
      if (saleData.status === "DRAFT" && saleData.customers) {
        const customerType =
          (saleData.customers as unknown as { customer_type?: string })?.customer_type ||
          "UMUM";
        if (customerType === "CUSTOM") {
          const { data: priceData } = await supabase
            .from("customer_item_prices")
            .select("item_id, price")
            .eq("customer_id", saleData.customer_id)
            .eq("is_active", true);
          customPriceMap = (priceData || []).reduce((acc, row) => {
            acc[row.item_id as string] = Number(row.price);
            return acc;
          }, {} as Record<string, number>);
        }
      }

      const normalizedItems =
        itemsData?.map((item) => {
          const iData = item.items as unknown as {
            name?: string;
            sku?: string;
            price_default?: number | null;
            price_khusus?: number | null;
            sizes?: { name: string };
            colors?: { name: string };
          };
          const basePrice = Number(iData?.price_default || 0);
          const khususPrice = Number(iData?.price_khusus || basePrice);
          const customerType =
            (saleData.customers as unknown as { customer_type?: string })?.customer_type ||
            "UMUM";
          let nextPrice = Number(item.unit_price);
          if (saleData.status === "DRAFT") {
            if (customerType === "CUSTOM") {
              nextPrice = customPriceMap[item.item_id] ?? basePrice;
            } else if (customerType === "KHUSUS") {
              nextPrice = khususPrice;
            } else {
              nextPrice = basePrice;
            }
          }
          return {
            ...item,
            unit_price: nextPrice,
            subtotal: item.qty * nextPrice,
            item_name: iData?.name || "Unknown",
            sku: iData?.sku || "",
            size_name: iData?.sizes?.name || undefined,
            color_name: iData?.colors?.name || undefined,
          };
        }) || [];

      // Merge duplicate lines (same item + price) for cleaner draft view
      const mergedMap = new Map<string, SalesItem>();
      normalizedItems.forEach((item) => {
        const key = `${item.item_id}::${item.unit_price}`;
        const existing = mergedMap.get(key);
        if (!existing) {
          mergedMap.set(key, { ...item });
          return;
        }
        const mergedQty = existing.qty + item.qty;
        mergedMap.set(key, {
          ...existing,
          qty: mergedQty,
          subtotal: existing.subtotal + item.subtotal,
        });
      });

      setItems(Array.from(mergedMap.values()));

      // Fetch related documents (only if POSTED)
      if (saleData.status === "POSTED") {
        const related: RelatedDoc = {};

        // Journal
        const { data: journalData } = await supabase
          .from("journals")
          .select("id, journal_date")
          .eq("ref_type", "sales")
          .eq("ref_id", saleId)
          .single();

        if (journalData) {
          related.journal_id = journalData.id;
          related.journal_date = journalData.journal_date;
        }

        // Receipt (if CASH)
        if (saleData.terms === "CASH") {
          const { data: receiptData } = await supabase
            .from("receipts")
            .select("id, amount")
            .eq("ref_type", "sales")
            .eq("ref_id", saleId)
            .single();

          if (receiptData) {
            related.receipt_id = receiptData.id;
            related.receipt_amount = receiptData.amount;
          }
        }

        // AR Invoice (if CREDIT)
        if (saleData.terms === "CREDIT") {
          const { data: arData } = await supabase
            .from("ar_invoices")
            .select("id, total_amount, outstanding_amount, status")
            .eq("sales_id", saleId)
            .single();

          if (arData) {
            related.ar_invoice_id = arData.id;
            related.ar_total = arData.total_amount;
            related.ar_outstanding = arData.outstanding_amount;
            related.ar_status = arData.status;
          }
        }

        setRelatedDocs(related);
      }

      // Fetch returns (all statuses)
      const { data: returnsData, error: returnsError } = await supabase
        .from("sales_returns")
        .select("id, return_date, total_amount, status, return_no")
        .eq("sales_id", saleId)
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
      setError(getErrorMessage(err, "Failed to fetch sales detail"));
    } finally {
      setLoading(false);
    }
  }

  async function fetchCompanyProfile() {
    const { data } = await supabase
      .from("company_profile")
      .select("*")
      .single();
    if (data) setCompany(data);
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
    if (!sale) return;
    const ok = await confirm({
      title: "Delete Draft Sales",
      description: "Hapus draft ini? Tindakan ini tidak bisa dibatalkan.",
      confirmText: "Delete",
      cancelText: "Cancel",
      tone: "danger",
    });
    if (!ok) return;

    setIsDeleting(true);
    setDeleteError(null);
    try {
      const { error } = await supabase.rpc("rpc_delete_sales_draft", {
        p_sales_id: sale.id,
      });
      if (error) throw error;
      setDeleteSuccess("Draft berhasil dihapus, kembali ke daftar...");
      setTimeout(() => navigate("/sales/history"), 700);
    } catch (err: unknown) {
      if (err instanceof Error) setDeleteError(err.message);
    } finally {
      setIsDeleting(false);
    }
  }

  async function handlePostDraft() {
    if (!sale) return;
    const ok = await confirm({
      title: "Post Sales",
      description: "Are you sure you want to POST this sales? This action cannot be undone.",
      confirmText: "POST",
      cancelText: "Cancel",
      tone: "danger",
    });
    if (!ok) return;

    setIsPosting(true);
    setPostError(null);
    setPostSuccess(null);

    try {
      const { error: rpcError } = await supabase.rpc("rpc_post_sales", {
        p_sales_id: sale.id,
      });

      if (rpcError) {
        if (rpcError.message?.includes("CLOSED")) {
          throw new Error("Cannot POST: Period is CLOSED for this date");
        } else if (rpcError.message?.includes("stock")) {
          throw new Error("Insufficient stock for one or more items");
        } else {
          throw rpcError;
        }
      }

      setPostSuccess("Sales posted successfully!");
      fetchSaleDetail(sale.id);
    } catch (err: unknown) {
      if (err instanceof Error) setPostError(err.message || "Failed to post sales");
    } finally {
      setIsPosting(false);
    }
  }

  function formatCurrency(amount: number) {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      minimumFractionDigits: 0,
    }).format(amount);
  }

  function getStatusBadge(status: string) {
    const colors = {
      DRAFT: "bg-gray-100 text-gray-800",
      POSTED: "bg-green-100 text-green-800",
      VOID: "bg-red-100 text-red-800",
    };
    return (
      <Badge className={colors[status as keyof typeof colors] || "bg-gray-100"}>
        {status}
      </Badge>
    );
  }

  const downloadFileName = useMemo(() => {
    const docNo = sale?.sales_no || sale?.id || "invoice";
    return `invoice-${docNo}.png`;
  }, [sale?.id, sale?.sales_no]);

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
        // best-effort cleanup if clone appended
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
        <p className="mt-2 text-gray-600">Loading sales detail...</p>
      </div>
    );
  }

  if (error || !sale) {
    return (
      <div className="w-full p-8">
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-md flex items-center gap-2">
          <Icons.Warning className="w-5 h-5 flex-shrink-0" />{" "}
          {error || "Sales not found"}
        </div>
        <Button
          onClick={() => navigate("/sales/history")}
          className="mt-4"
          icon={<Icons.ArrowLeft className="w-4 h-4" />}
        >
          Back to List
        </Button>
      </div>
    );
  }

  return (
    <div className="w-full space-y-6">
      <div className="flex flex-col gap-3 print:hidden">
        <div className="flex justify-between items-center">
          <h2 className="text-3xl font-bold tracking-tight text-gray-900">
            Sales Detail
          </h2>
          <div className="flex gap-2 no-print flex-wrap">
            {/* Register Payment Action */}
            {sale.status === "POSTED" &&
              sale.terms === "CREDIT" &&
              relatedDocs.ar_status !== "PAID" && (
                <Button
                  variant="success"
                  onClick={() => {
                    if (relatedDocs.ar_invoice_id) {
                      navigate(`/finance?ar=${relatedDocs.ar_invoice_id}`);
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
            {sale.status === "POSTED" && (
              <Button
                onClick={() => navigate(`/sales-return?sales=${sale.id}`)}
                variant="primary"
                icon={<Icons.Plus className="w-4 h-4" />}
              >
                Create Return
              </Button>
            )}
            <Button
              onClick={() => navigate("/sales/history")}
              variant="outline"
              icon={<Icons.ArrowLeft className="w-4 h-4" />}
            >
              Back to List
            </Button>
            {sale.status === "DRAFT" && (
              <Button
                onClick={() => navigate(`/sales/${sale.id}/edit`)}
                variant="primary"
                icon={<Icons.Edit className="w-4 h-4" />}
              >
                Edit
              </Button>
            )}
            {sale.status === "DRAFT" && (
              <Button
                onClick={handlePostDraft}
                isLoading={isPosting}
                disabled={isPosting}
                variant="success"
                icon={<Icons.Check className="w-4 h-4" />}
              >
                Post
              </Button>
            )}
            {sale.status === "DRAFT" && (
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
            <p className="font-semibold text-slate-900">{sale.sales_no || sale.id.substring(0, 8)}</p>
          </div>
          <div className="space-y-1">
            <p className="text-[11px] uppercase tracking-wide text-slate-500">Status</p>
            <div>{getStatusBadge(sale.status)}</div>
          </div>
          <div className="space-y-1">
            <p className="text-[11px] uppercase tracking-wide text-slate-500">Date</p>
            <p className="font-semibold text-slate-900">
              {new Date(sale.sales_date).toLocaleDateString("id-ID")}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-[11px] uppercase tracking-wide text-slate-500">Customer</p>
            <div className="font-semibold text-slate-900">
              <CustomerBadge name={sale.customer_name} customerType={sale.customer_type} />
            </div>
          </div>
          <div className="space-y-1 md:text-right">
            <p className="text-[11px] uppercase tracking-wide text-slate-500">Total</p>
            <p className="font-semibold text-slate-900">{formatCurrency(displayTotal)}</p>
          </div>
        </div>
        {(deleteError || deleteSuccess) && (
          <div className="w-full">
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
        {downloadError && (
          <div className="w-full">
            <Alert variant="error" title="Gagal" description={downloadError} />
          </div>
        )}
        {(postError || postSuccess) && (
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
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 space-y-6">
          {/* Header Card */}
          <Card className="print:hidden">
            <CardHeader className="bg-gray-50">
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle>Sales Document</CardTitle>
                  <p className="text-sm text-gray-600 mt-1">
                    {sale.sales_no || `ID: ${sale.id.substring(0, 8)}`}
                  </p>
                </div>
                {getStatusBadge(sale.status)}
              </div>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <p className="text-gray-600">Date</p>
                  <p className="font-medium">
                    {new Date(sale.sales_date).toLocaleDateString("id-ID")}
                  </p>
                </div>
                <div>
                  <p className="text-gray-600">Customer</p>
                  <div className="font-medium mt-1">
                    <CustomerBadge name={sale.customer_name} customerType={sale.customer_type} />
                  </div>
                </div>
                <div>
                  <p className="text-gray-600">Terms</p>
                  <p className="font-medium">
                    <Badge
                      className={
                        sale.terms === "CASH"
                          ? "bg-blue-100 text-blue-800"
                          : "bg-orange-100 text-orange-800"
                      }
                    >
                      {sale.terms}
                    </Badge>
                  </p>
                </div>
                <div>
                  <p className="text-gray-600">Total</p>
                  <p className="font-bold text-lg">
                    {formatCurrency(displayTotal)}
                  </p>
                </div>
              </div>
              {sale.notes && (
                <div className="mt-4 pt-4 border-t">
                  <p className="text-gray-600 text-sm">Notes</p>
                  <p className="text-sm mt-1">{sale.notes}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Items Table */}
          <Card className="print:hidden">
            <CardHeader>
              <CardTitle>Line Items</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>SKU</TableHead>
                    <TableHead>Item Name</TableHead>
                    <TableHead>Size</TableHead>
                    <TableHead>Color</TableHead>
                    <TableHead>UoM</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Unit Price</TableHead>
                    <TableHead className="text-right">Subtotal</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-mono text-sm">
                        {item.sku}
                      </TableCell>
                      <TableCell>
                        {item.item_name}
                      </TableCell>
                      <TableCell className="text-sm text-gray-600">
                        {item.size_name || '-'}
                      </TableCell>
                      <TableCell className="text-sm text-gray-600">
                        {item.color_name || '-'}
                      </TableCell>
                      <TableCell>{item.uom_snapshot}</TableCell>
                      <TableCell className="text-right">{item.qty}</TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(item.unit_price)}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(item.subtotal)}
                      </TableCell>
                    </TableRow>
                  ))}
                  {(sale.shipping_fee || 0) > 0 && (
                    <TableRow className="bg-gray-50">
                      <TableCell colSpan={7} className="text-right">
                        Ongkir
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(sale.shipping_fee || 0)}
                      </TableCell>
                    </TableRow>
                  )}
                  {(sale.discount_amount || 0) > 0 && (
                    <TableRow className="bg-gray-50">
                      <TableCell colSpan={7} className="text-right">
                        Diskon
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        -{formatCurrency(sale.discount_amount || 0)}
                      </TableCell>
                    </TableRow>
                  )}
                  <TableRow className="bg-gray-50 font-bold border-t-2">
                    <TableCell colSpan={7} className="text-right">
                      TOTAL:
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(displayTotal)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        <div className="xl:col-span-1 space-y-6 print:hidden">
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
                  <span className="text-gray-500">Ongkir</span>
                  <span className="font-medium">{formatCurrency(sale.shipping_fee || 0)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Diskon</span>
                  <span className="font-medium text-red-600">-{formatCurrency(sale.discount_amount || 0)}</span>
                </div>
                <div className="flex justify-between border-t pt-3">
                  <span className="text-gray-700 font-semibold">Total</span>
                  <span className="font-bold">{formatCurrency(displayTotal)}</span>
                </div>
                <div className="pt-2 border-t">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Terms</span>
                    <span className="font-medium">{sale.terms}</span>
                  </div>
                  {sale.terms === "CASH" && (
                    <div className="flex justify-between">
                      <span className="text-gray-500">Payment</span>
                      <span className="font-medium">{sale.payment_method_code || "-"}</span>
                    </div>
                  )}
                  {sale.terms === "CREDIT" && relatedDocs.ar_outstanding != null && (
                    <div className="flex justify-between">
                      <span className="text-gray-500">Outstanding</span>
                      <span className="font-semibold text-amber-600">
                        {formatCurrency(relatedDocs.ar_outstanding)}
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
                              <TableCell>{getStatusBadge(ret.status)}</TableCell>
                              <TableCell className="text-right">
                                <Button
                                  size="icon"
                                  variant="outline"
                                  onClick={() => navigate(`/sales-returns/${ret.id}`)}
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

            {/* Related Documents (POSTED only) */}
            {sale.status === "POSTED" && (
              <RelatedDocumentsCard
                items={[
                  ...(relatedDocs.journal_id
                    ? [
                      {
                        id: relatedDocs.journal_id,
                        title: "Journal Entry",
                        description: (
                          <p>
                            ID: {relatedDocs.journal_id.substring(0, 8)} | Date:{" "}
                            {new Date(relatedDocs.journal_date!).toLocaleDateString(
                              "id-ID",
                            )}
                          </p>
                        ),
                        icon: <Icons.FileText className="w-5 h-5" />,
                        toneClassName: "bg-blue-50",
                        iconClassName: "text-blue-500",
                        actionLabel: "Open",
                        onAction: () =>
                          navigate(
                            `/journals?q=${encodeURIComponent(
                              sale.sales_no || relatedDocs.journal_id!
                            )}`
                          ),
                      } as RelatedDocumentItem,
                    ]
                    : []),
                  ...(relatedDocs.receipt_id
                    ? [
                      {
                        id: relatedDocs.receipt_id,
                        title: "Receipt (CASH)",
                        description: (
                          <p>
                            ID: {relatedDocs.receipt_id.substring(0, 8)} | Amount:{" "}
                            {formatCurrency(relatedDocs.receipt_amount!)}
                          </p>
                        ),
                        icon: <Icons.DollarSign className="w-5 h-5" />,
                        toneClassName: "bg-green-50",
                        iconClassName: "text-green-500",
                      } as RelatedDocumentItem,
                    ]
                    : []),
                  ...(relatedDocs.ar_invoice_id
                    ? [
                      {
                        id: relatedDocs.ar_invoice_id,
                        title: "AR Invoice (CREDIT)",
                        description: (
                          <p>
                            ID: {relatedDocs.ar_invoice_id.substring(0, 8)} | Total:{" "}
                            {formatCurrency(relatedDocs.ar_total!)} | Outstanding:{" "}
                            {formatCurrency(relatedDocs.ar_outstanding!)} | Status:{" "}
                            <Badge className="ml-1">{relatedDocs.ar_status}</Badge>
                          </p>
                        ),
                        icon: <Icons.FileText className="w-5 h-5" />,
                        toneClassName: "bg-orange-50",
                        iconClassName: "text-orange-500",
                        actionLabel: "Open AR",
                        onAction: () =>
                          navigate(
                            `/finance?ar=${encodeURIComponent(
                              relatedDocs.ar_invoice_id!
                            )}`
                          ),
                      } as RelatedDocumentItem,
                    ]
                    : []),
                ]}
              />
            )}
          </div>
        </div>
      </div>

      {/* --- PRINT ONLY SECTION --- */}
      {sale && (
        <div
          ref={printRef}
          className="absolute -left-[99999px] top-0 opacity-0 pointer-events-none print:static print:opacity-100 print:pointer-events-auto"
        >
          <SalesInvoicePrint
            data={{
              id: sale.id,
              sales_no: sale.sales_no,
              sales_date: sale.sales_date,
              customer_name: sale.customer_name,
              terms: sale.terms,
              total_amount: displayTotal,
              shipping_fee: sale.shipping_fee,
              discount_amount: sale.discount_amount,
              notes: sale.notes
            }}
            items={items}
            company={company}
            banks={companyBanks}
            visibleOnScreen
          />
        </div>
      )}
    </div>
  );
}
