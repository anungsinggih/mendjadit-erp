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
import { CustomerBadge } from "./ui/CustomerBadge";
import { Icons } from './ui/Icons'
import { ResponsiveTable } from './ui/ResponsiveTable';
import { EmptyState } from "./ui/EmptyState";
import { formatCurrency, formatDate, safeDocNo } from "../lib/format";
import { usePagination } from "../hooks/usePagination";
import { useDebounce } from "../hooks/useDebounce";
import { Pagination } from "./ui/Pagination";
import { PageHeader } from "./ui/PageHeader";
import { Section } from "./ui/Section";
import { useSalesHistoryQuery, useSalesReturnDraftCountQuery, prefetchSalesDetail, useQueryClient } from "../hooks/useQueries";

type SalesRecord = {
  id: string;
  sales_date: string;
  sales_no: string | null;
  customer_id: string;
  customer_name: string;
  customer_type: string;
  terms: "CASH" | "CREDIT";
  total_amount: number;
  payment_method_code?: string | null;
  ar_outstanding?: number | null;
  status: "DRAFT" | "POSTED" | "VOID";
  created_at: string;
};

type SalesRowProps = {
  sale: SalesRecord;
  onOpen: (id: string) => void;
  onEdit: (id: string) => void;
  onPost: (id: string) => void;
  postingId: string | null;
  onPrefetch: (id: string) => void;
};

const SalesRow = memo(({ sale, onOpen, onEdit, onPost, postingId, onPrefetch }: SalesRowProps) => (
  <TableRow
    className="cursor-pointer hover:bg-slate-50"
    onClick={() => onOpen(sale.id)}
    onMouseEnter={() => onPrefetch(sale.id)}
  >
    <TableCell>{formatDate(sale.sales_date)}</TableCell>
    <TableCell className="font-mono text-sm">
      {safeDocNo(sale.sales_no, sale.id)}
    </TableCell>
    <TableCell>
      <CustomerBadge name={sale.customer_name} customerType={sale.customer_type} />
    </TableCell>
    <TableCell>
      <div className="flex items-center gap-2">
        <Badge
          className={
            sale.terms === "CASH"
              ? "bg-blue-100 text-blue-800"
              : "bg-orange-100 text-orange-800"
          }
        >
          {sale.terms}
        </Badge>
        {sale.terms === "CASH" && (
          <span className="text-[11px] text-gray-500 font-medium">
            {sale.payment_method_code || "-"}
          </span>
        )}
      </div>
    </TableCell>
    <TableCell className="text-right font-medium">
      {formatCurrency(sale.total_amount)}
    </TableCell>
    <TableCell className="text-right">
      {sale.terms === "CREDIT" && sale.ar_outstanding != null
        ? formatCurrency(sale.ar_outstanding)
        : "-"}
    </TableCell>
    <TableCell>
      <StatusBadge status={sale.status} />
    </TableCell>
    <TableCell className="text-right">
      <div className="flex flex-wrap items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
        {sale.status === "DRAFT" && (
          <>
            <Button
              size="icon"
              variant="outline"
              onClick={(e) => {
                e.stopPropagation();
                onEdit(sale.id);
              }}
              icon={<Icons.Edit className="w-4 h-4" />}
              className="w-full sm:w-auto"
              aria-label="Edit sales"
              title="Edit"
            />
            <Button
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onPost(sale.id);
              }}
              disabled={postingId === sale.id}
              isLoading={postingId === sale.id}
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

SalesRow.displayName = 'SalesRow';

export default function SalesHistory() {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [postingId, setPostingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);
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
    data: allSalesData,
    isLoading,
    isFetching,
    error: fetchError,
    refetch: refetchSales
  } = useSalesHistoryQuery({
    range: [0, 0], // unused, kept for type compat
    search: "",    // search handled client-side
    statusFilter,
    termsFilter,
    dateFrom,
    dateTo
  });

  const allSales = allSalesData ?? []
  const filteredSales = useMemo(() => {
    if (!debouncedSearch.trim()) return allSales
    const term = debouncedSearch.toLowerCase()
    return allSales.filter(s =>
      s.sales_no?.toLowerCase().includes(term) ||
      s.customer_name?.toLowerCase().includes(term)
    )
  }, [allSales, debouncedSearch])

  const totalCount = filteredSales.length
  const sales = useMemo(() => {
    const start = (page - 1) * pageSize
    return filteredSales.slice(start, start + pageSize)
  }, [filteredSales, page, pageSize])

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, statusFilter, termsFilter, dateFrom, dateTo, setPage]);

  const { data: draftReturnCount = 0, refetch: refetchDraftCount } = useSalesReturnDraftCountQuery();

  const handlePost = useCallback(async (saleId: string) => {
    const ok = await confirm({
      title: "Post Sales",
      description: "Are you sure you want to POST this sales? This action cannot be undone.",
      confirmText: "POST",
      cancelText: "Cancel",
      tone: "danger",
    });
    if (!ok) return;

    setPostingId(saleId);
    setError(null);
    setSuccess(null);

    try {
      const { error: rpcError } = await supabase.rpc("rpc_post_sales", {
        p_sales_id: saleId,
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

      setSuccess("Sales posted successfully!");
      navigate(`/sales/${saleId}`);
    } catch (err: unknown) {
      setSuccess(null);
      if (err instanceof Error) {
        setError(err.message || "Failed to post sales");
      } else if (err && typeof err === "object" && "message" in err) {
        setError(String((err as { message?: string }).message || "Failed to post sales"));
      } else {
        setError("Failed to post sales");
      }
    } finally {
      setPostingId(null);
    }
  }, [confirm, navigate]);

  const handleOpen = useCallback((id: string) => navigate(`/sales/${id}`), [navigate]);
  const handleEdit = useCallback((id: string) => navigate(`/sales/${id}/edit`), [navigate]);

  const queryClient = useQueryClient();
  const handlePrefetch = useCallback((id: string) => {
    prefetchSalesDetail(queryClient, id);
  }, [queryClient]);

  const loading = isLoading || isFetching;
  const fetchErrorMessage = fetchError instanceof Error ? fetchError.message : fetchError ? "Failed to fetch sales" : null;

  if (loading) {
    return (
      <div className="w-full p-8 text-center">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
        <p className="mt-2 text-gray-600">Loading sales...</p>
      </div>
    );
  }

  return (
    <div className="w-full space-y-6 pb-20">
      <PageHeader
        title="Sales History"
        description="View and manage sales transactions."
        breadcrumbs={[{ label: "Dashboard", href: "/" }, { label: "Sales" }]}
        actions={
          <div className="flex gap-2">
            <Button
              onClick={() => {
                refetchSales();
                refetchDraftCount();
              }}
              variant="outline"
              size="icon"
              icon={<Icons.Refresh className="w-4 h-4" />}
              title="Refresh"
            />
            <Button
              onClick={() => navigate("/sales-returns/history")}
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
              onClick={() => navigate("/sales")}
              icon={<Icons.Plus className="w-4 h-4" />}
            >
              New Sales
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

      <Section
        title="Filter Sales"
        description="Search and filter transactions."
      >
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-end">
          <div className="col-span-12 sm:col-span-6 lg:col-span-3">
            <Input
              label="Search"
              placeholder="Doc No / Customer"
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
          <CardTitle>Sales List ({totalCount})</CardTitle>
        </CardHeader>
        <CardContent>


          {sales.length === 0 ? (
            <EmptyState
              icon={<Icons.FileText className="w-5 h-5" />}
              title="No sales records found"
              description="Create your first sale to get started"
            />
          ) : (
            <ResponsiveTable minWidth="640px">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Doc No</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Terms / Payment</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Outstanding</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sales.map((sale) => (
                    <SalesRow
                      key={sale.id}
                      sale={sale}
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
