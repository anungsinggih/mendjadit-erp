import { useEffect, useState, useCallback, memo, useMemo } from "react";
import { supabase } from "../supabaseClient";
import { useNavigate, useSearchParams } from "react-router-dom";
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
import { Input } from "./ui/Input";
import { Select } from "./ui/Select";
import { Alert } from "./ui/Alert";
import { StatusBadge } from "./ui/StatusBadge";
import { useConfirm } from "./ui/ConfirmDialogContext";
import { Badge } from "./ui/Badge";
import { Icons } from "./ui/Icons";
import { ResponsiveTable } from "./ui/ResponsiveTable";
import { EmptyState } from "./ui/EmptyState";
import { formatCurrency, formatDate, safeDocNo } from "../lib/format";
import { usePagination } from "../hooks/usePagination";
import { Pagination } from "./ui/Pagination";
import { PageHeader } from "./ui/PageHeader";
import { Section } from "./ui/Section";
import { usePurchaseHistoryQuery, usePurchaseReturnDraftCountQuery, prefetchPurchaseDetail, useQueryClient } from "../hooks/useQueries";


type PurchaseRecord = {
  id: string;
  purchase_date: string;
  purchase_no: string | null;
  vendor_id: string;
  vendor_name: string;
  terms: "CASH" | "CREDIT";
  total_amount: number;
  payment_method_code?: string | null;
  ap_outstanding?: number | null;
  status: "DRAFT" | "POSTED" | "VOID";
  created_at: string;
};

type PurchaseRowProps = {
  purchase: PurchaseRecord;
  onOpen: (id: string) => void;
  onEdit: (id: string) => void;
  onPost: (id: string) => void;
  postingId: string | null;
  onPrefetch: (id: string) => void;
};

const PurchaseRow = memo(({ purchase, onOpen, onEdit, onPost, postingId, onPrefetch }: PurchaseRowProps) => (
  <TableRow
    className="cursor-pointer hover:bg-slate-50"
    onClick={() => onOpen(purchase.id)}
    onMouseEnter={() => onPrefetch(purchase.id)}
  >
    <TableCell>{formatDate(purchase.purchase_date)}</TableCell>
    <TableCell className="font-mono text-sm">
      {safeDocNo(purchase.purchase_no, purchase.id)}
    </TableCell>
    <TableCell>{purchase.vendor_name}</TableCell>
    <TableCell>
      <div className="flex items-center gap-2">
        <Badge
          className={
            purchase.terms === "CASH"
              ? "bg-blue-100 text-blue-800"
              : "bg-orange-100 text-orange-800"
          }
        >
          {purchase.terms}
        </Badge>
        {purchase.terms === "CASH" && (
          <span className="text-[11px] text-gray-500 font-medium">
            {purchase.payment_method_code || "-"}
          </span>
        )}
      </div>
    </TableCell>
    <TableCell className="text-right font-medium">
      {formatCurrency(purchase.total_amount)}
    </TableCell>
    <TableCell className="text-right">
      {purchase.terms === "CREDIT" && purchase.ap_outstanding != null
        ? formatCurrency(purchase.ap_outstanding)
        : "-"}
    </TableCell>
    <TableCell>
      <StatusBadge status={purchase.status} />
    </TableCell>
    <TableCell className="text-right">
      <div className="flex flex-wrap items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
        {purchase.status === "DRAFT" && (
          <>
            <Button
              size="icon"
              variant="outline"
              onClick={(e) => {
                e.stopPropagation();
                onEdit(purchase.id);
              }}
              icon={<Icons.Edit className="w-4 h-4" />}
              className="w-full sm:w-auto"
              aria-label="Edit purchase"
              title="Edit"
            />
            <Button
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onPost(purchase.id);
              }}
              disabled={postingId === purchase.id}
              isLoading={postingId === purchase.id}
              className="w-full sm:w-auto bg-green-600 hover:bg-green-700 text-white"
              icon={<Icons.Check className="w-4 h-4" />}
            >
              POST
            </Button>
          </>
        )}
      </div>
    </TableCell>
  </TableRow>
));

PurchaseRow.displayName = 'PurchaseRow';

export default function PurchaseHistory() {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [postingId, setPostingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [searchParams] = useSearchParams();
  const initialStatus = searchParams.get("status");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "DRAFT" | "POSTED" | "VOID">(
    (initialStatus && ["DRAFT", "POSTED", "VOID"].includes(initialStatus))
      ? (initialStatus as "DRAFT" | "POSTED" | "VOID")
      : "ALL"
  );
  const [termsFilter, setTermsFilter] = useState<"ALL" | "CASH" | "CREDIT">("ALL");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const navigate = useNavigate();
  const { confirm } = useConfirm();

  const { page, setPage, pageSize } = usePagination();

  const {
    data: allPurchaseData,
    isLoading,
    isFetching,
    error: fetchError,
    refetch: refetchPurchases
  } = usePurchaseHistoryQuery({
    range: [0, 0], // unused, kept for type compat
    search: "",    // search handled client-side
    statusFilter,
    termsFilter,
    dateFrom,
    dateTo
  });

  // Client-side search + pagination — instant, no DB round-trip
  const allPurchases = allPurchaseData ?? []
  const filteredPurchases = useMemo(() => {
    if (!search.trim()) return allPurchases
    const term = search.toLowerCase()
    return allPurchases.filter(p =>
      p.purchase_no?.toLowerCase().includes(term) ||
      p.vendor_name?.toLowerCase().includes(term)
    )
  }, [allPurchases, search])

  const totalCount = filteredPurchases.length
  const purchases = useMemo(() => {
    const start = (page - 1) * pageSize
    return filteredPurchases.slice(start, start + pageSize)
  }, [filteredPurchases, page, pageSize])

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, termsFilter, dateFrom, dateTo, setPage]);

  const { data: draftReturnCount = 0, refetch: refetchDraftCount } = usePurchaseReturnDraftCountQuery();

  const handlePost = useCallback(async (purchaseId: string) => {
    const ok = await confirm({
      title: "Post Purchase",
      description: "Are you sure you want to POST this purchase? This action cannot be undone.",
      confirmText: "POST",
      cancelText: "Cancel",
      tone: "danger",
    });
    if (!ok) return;

    setPostingId(purchaseId);
    setError(null);
    setSuccess(null);

    try {
      const { data, error: rpcError } = await supabase.rpc("rpc_post_purchase", {
        p_purchase_id: purchaseId,
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
      setSuccess(
        journalSkipped
          ? "Purchase posted. Journal skipped (total 0 untuk FINISHED_GOOD)."
          : "Purchase posted successfully!"
      );
      navigate(`/purchases/${purchaseId}`);
    } catch (err: unknown) {
      setSuccess(null);
      if (err instanceof Error) {
        setError(err.message || "Failed to post purchase");
      } else if (err && typeof err === "object" && "message" in err) {
        setError(String((err as { message?: string }).message || "Failed to post purchase"));
      } else {
        setError("Failed to post purchase");
      }
    } finally {
      setPostingId(null);
    }
  }, [confirm, navigate]);

  const handleOpen = useCallback((id: string) => navigate(`/purchases/${id}`), [navigate]);
  const handleEdit = useCallback((id: string) => navigate(`/purchases/${id}/edit`), [navigate]);

  const queryClient = useQueryClient();
  const handlePrefetch = useCallback((id: string) => {
    prefetchPurchaseDetail(queryClient, id);
  }, [queryClient]);

  const loading = isLoading || isFetching;
  const fetchErrorMessage = fetchError instanceof Error ? fetchError.message : fetchError ? "Failed to fetch purchases" : null;

  if (loading) {
    return (
      <div className="w-full p-8 text-center">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
        <p className="mt-2 text-gray-600">Loading purchases...</p>
      </div>
    );
  }

  return (
    <div className="w-full space-y-6 pb-20">
      <PageHeader
        title="Purchase History"
        description="View and manage purchase transactions."
        breadcrumbs={[{ label: "Dashboard", href: "/" }, { label: "Purchases" }]}
        actions={
          <div className="flex gap-2">
            <Button
              onClick={() => {
                refetchPurchases();
                refetchDraftCount();
              }}
              variant="outline"
              size="icon"
              icon={<Icons.Refresh className="w-4 h-4" />}
              title="Refresh"
            />
            <Button
              onClick={() => navigate("/purchase-returns/history")}
              variant="outline"
              icon={<Icons.RotateCcw className="w-4 h-4" />}
              className="border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800 hover:border-red-300"
            >
              Return List
              {draftReturnCount > 0 && (
                <span className="ml-2 inline-flex items-center justify-center rounded-full bg-red-100 text-red-800 border border-red-200 text-[10px] font-semibold px-2 py-0.5">
                  {draftReturnCount}
                </span>
              )}
            </Button>
            <Button
              onClick={() => navigate("/purchases")}
              icon={<Icons.Plus className="w-4 h-4" />}
            >
              New Purchase
            </Button>
          </div>
        }
      />

      {(fetchErrorMessage || error) && (
        <Alert variant="error" title="Kesalahan" description={fetchErrorMessage || error || ""} />
      )}
      {success && (
        <Alert variant="success" title="Sukses" description={success} />
      )}

      {/* FILTER SECTION */}
      <Section
        title="Filter Purchases"
        description="Search and filter transactions."
      >
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-end">
          <div className="col-span-12 sm:col-span-6 lg:col-span-3">
            <Input
              label="Search"
              placeholder="Doc No / Vendor"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              containerClassName="!mb-0"
            />
          </div>
          <div className="col-span-6 sm:col-span-3 lg:col-span-2">
            <Select
              label="Status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as "ALL" | "DRAFT" | "POSTED" | "VOID")}
              options={[
                { label: "All Status", value: "ALL" },
                { label: "Draft", value: "DRAFT" },
                { label: "Posted", value: "POSTED" },
                { label: "Void", value: "VOID" },
              ]}
              className="!mb-0"
            />
          </div>
          <div className="col-span-6 sm:col-span-3 lg:col-span-2">
            <Select
              label="Terms"
              value={termsFilter}
              onChange={(e) => setTermsFilter(e.target.value as "ALL" | "CASH" | "CREDIT")}
              options={[
                { label: "All Terms", value: "ALL" },
                { label: "Cash", value: "CASH" },
                { label: "Credit", value: "CREDIT" },
              ]}
              className="!mb-0"
            />
          </div>
          <div className="col-span-12 sm:col-span-6 lg:col-span-4 flex gap-2">
            <Input
              label="From"
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              containerClassName="!mb-0 w-full"
            />
            <Input
              label="To"
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              containerClassName="!mb-0 w-full"
            />
          </div>

          <div className="col-span-12 sm:col-span-6 lg:col-span-1">
            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                setSearch("");
                setStatusFilter("ALL");
                setTermsFilter("ALL");
                setDateFrom("");
                setDateTo("");
              }}
              icon={<Icons.Close className="w-4 h-4" />}
              title="Clear Filters"
            >
              Clear
            </Button>
          </div>
        </div>
      </Section>

      <Card>
        <CardHeader>
          <CardTitle>Purchase List ({totalCount})</CardTitle>
        </CardHeader>
        <CardContent>

          {purchases.length === 0 ? (
            <EmptyState
              icon={<Icons.FileText className="w-5 h-5" />}
              title="No purchase records found"
              description="Create your first purchase to get started"
            />
          ) : (
            <ResponsiveTable minWidth="640px">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Doc No</TableHead>
                    <TableHead>Vendor</TableHead>
                    <TableHead>Terms / Payment</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Outstanding</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {purchases.map((purchase: PurchaseRecord) => (
                    <PurchaseRow
                      key={purchase.id}
                      purchase={purchase}
                      onOpen={handleOpen}
                      onEdit={handleEdit}
                      onPost={handlePost}
                      postingId={postingId}
                      onPrefetch={handlePrefetch}
                    />
                  ))}
                </TableBody>
              </Table>
              <Pagination
                currentPage={page}
                totalCount={totalCount}
                pageSize={pageSize}
                onPageChange={setPage}
                isLoading={loading}
              />
            </ResponsiveTable>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
