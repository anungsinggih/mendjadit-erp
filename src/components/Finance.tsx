import { useEffect, useState, useCallback } from "react";
import { supabase } from "../supabaseClient";
import { PageHeader } from "./ui/PageHeader";
// import { Card, CardContent } from "./ui/Card";
import { Alert } from "./ui/Alert";
import { Icons } from "./ui/Icons";
import { useLocation, useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/Dialog";

// Sub-components
import { FinanceARList } from "./FinanceARList";
import { FinanceAPList } from "./FinanceAPList";
import { FinanceReceiptForm } from "./FinanceReceiptForm";
import { FinancePaymentForm } from "./FinancePaymentForm";

export default function Finance() {
  const location = useLocation();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [activeTab, setActiveTab] = useState<"AR" | "AP">("AR");
  const [summary, setSummary] = useState<{ total_ar: number; total_ap: number; cash_balance: number } | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [arAging, setArAging] = useState<{ bucket_0_30: number; bucket_31_60: number; bucket_61_plus: number } | null>(null);
  const [apAging, setApAging] = useState<{ bucket_0_30: number; bucket_31_60: number; bucket_61_plus: number } | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [formType, setFormType] = useState<"AR" | "AP">("AR");

  // Shared Form State
  const [selectedId, setSelectedId] = useState("");
  const [selectedAmount, setSelectedAmount] = useState(0);

  // Payment Methods State (Shared)
  const [paymentMethods, setPaymentMethods] = useState<{ code: string; name: string }[]>([]);
  const [methodError, setMethodError] = useState<string | null>(null);

  useEffect(() => {
    fetchPaymentMethods();
  }, []);

  useEffect(() => {
    let active = true;
    const loadRole = async () => {
      try {
        const { data } = await supabase.auth.getUser();
        if (!data?.user) return;
        const { data: profile } = await supabase
          .from("user_profiles")
          .select("role")
          .eq("id", data.user.id)
          .single();
        if (active) setIsOwner((profile?.role || "").toUpperCase() === "OWNER");
      } catch (err) {
        console.error(err);
      }
    };
    loadRole();
    return () => {
      active = false;
    };
  }, []);

  const fetchSummary = useCallback(async () => {
    setSummaryLoading(true);
    try {
      const { data, error } = await supabase.rpc("rpc_get_dashboard_metrics");
      if (error) throw error;
      setSummary({
        total_ar: Number(data?.total_ar || 0),
        total_ap: Number(data?.total_ap || 0),
        cash_balance: Number(data?.cash_balance || 0),
      });
    } catch (err) {
      console.error(err);
      setSummary(null);
    } finally {
      setSummaryLoading(false);
    }
  }, []);

  /* ----------------------------------------------------------------
   *  URL Params Handling (Deep Linking from Sales/Purchase Detail)
   * ---------------------------------------------------------------- */
  const [initialArId, setInitialArId] = useState<string | null>(null);
  const [initialApId, setInitialApId] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const arId = params.get("ar");
    const apId = params.get("ap");
    const tabParam = params.get("tab");

    if (arId) {
      handleTabChange("AR");
      setInitialArId(arId);
    } else if (apId) {
      handleTabChange("AP");
      setInitialApId(apId);
    } else if (tabParam === "AP") {
      handleTabChange("AP");
    } else if (tabParam === "AR") {
      handleTabChange("AR");
    } else {
      // Clear initials if URL params are gone
      setInitialArId(null);
      setInitialApId(null);
    }
  }, [location.search]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary, refreshTrigger]);

  const computeAgingBuckets = useCallback((rows: { date: string; outstanding: number }[]) => {
    const buckets = { bucket_0_30: 0, bucket_31_60: 0, bucket_61_plus: 0 };
    const now = new Date();
    rows.forEach((row) => {
      const d = new Date(row.date);
      const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays <= 30) buckets.bucket_0_30 += row.outstanding;
      else if (diffDays <= 60) buckets.bucket_31_60 += row.outstanding;
      else buckets.bucket_61_plus += row.outstanding;
    });
    return buckets;
  }, []);

  const fetchAgingSummary = useCallback(async () => {
    if (!isOwner) return;
    try {
      const { data: arRows, error: arError } = await supabase
        .from("ar_invoices")
        .select("invoice_date, outstanding_amount, status")
        .neq("status", "PAID");
      if (arError) throw arError;
      const arClean = (arRows || [])
        .filter((r) => (r.outstanding_amount || 0) > 0 && r.invoice_date)
        .map((r) => ({ date: r.invoice_date as string, outstanding: Number(r.outstanding_amount || 0) }));
      setArAging(computeAgingBuckets(arClean));

      const { data: apRows, error: apError } = await supabase
        .from("ap_bills")
        .select("bill_date, outstanding_amount, status")
        .neq("status", "PAID");
      if (apError) throw apError;
      const apClean = (apRows || [])
        .filter((r) => (r.outstanding_amount || 0) > 0 && r.bill_date)
        .map((r) => ({ date: r.bill_date as string, outstanding: Number(r.outstanding_amount || 0) }));
      setApAging(computeAgingBuckets(apClean));
    } catch (err) {
      console.error(err);
      setArAging(null);
      setApAging(null);
    }
  }, [computeAgingBuckets, isOwner]);

  useEffect(() => {
    if (isOwner) {
      fetchAgingSummary();
    } else {
      setArAging(null);
      setApAging(null);
    }
  }, [isOwner, fetchAgingSummary, refreshTrigger]);



  async function fetchPaymentMethods() {
    const { data, error } = await supabase
      .from("payment_methods")
      .select("code, name")
      .eq("is_active", true)
      .order("code", { ascending: true });

    if (error) {
      setMethodError("Gagal memuat metode pembayaran; gunakan default CASH/BANK.");
      setPaymentMethods([
        { code: "CASH", name: "Kas (Default)" },
        { code: "BANK", name: "Bank (Default)" },
      ]);
    } else {
      setMethodError(null);
      setPaymentMethods(data || []);
    }
  }

  function handleSelect(id: string, amount: number) {
    setSelectedId(id);
    setSelectedAmount(amount);
    setError(null);
    setSuccess(null);
    setFormType(activeTab);
    setFormOpen(true);
  }

  function handleSuccess(msg: string) {
    setSuccess(msg);
    setSelectedId("");
    setSelectedAmount(0);
    setRefreshTrigger(prev => prev + 1); // Trigger List Refresh
    setFormOpen(false);

    // Clear URL params on success too
    navigate(location.pathname, { replace: true });
  }

  function handleError(msg: string) {
    setError(msg);
  }

  // Handle Tab Change to reset selection
  function handleTabChange(tab: "AR" | "AP") {
    setActiveTab(tab);
    setSelectedId("");
    setSuccess(null);
    setError(null);
    setFormOpen(false);
  }

  function handleCloseForm() {
    setFormOpen(false);
    setSelectedId("");
    setSelectedAmount(0);

    // Clear URL params to prevent re-opening if it was deep linked
    navigate(location.pathname, { replace: true });
  }

  return (
    <div className="w-full space-y-8 pb-12 max-w-[1600px] mx-auto">
      <PageHeader
        title="Finance & Cash Flow"
        description="Monitor outstanding invoices, pay bills, and manage cash flow."
        breadcrumbs={[{ label: 'Dashboard', href: '/' }, { label: 'Finance' }]}
      />

      {/* Metrics Section */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="group bg-white rounded-xl p-5 border border-slate-200 shadow-sm hover:shadow-md transition-all relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-50 rounded-full blur-2xl -translate-y-1/2 translate-x-1/3"></div>
          <div className="relative z-10 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-500 mb-1">Total Receivables (AR)</p>
              <h3 className="text-2xl font-bold text-slate-900 tracking-tight">
                {summaryLoading ? "..." : (summary?.total_ar || 0).toLocaleString("id-ID")}
              </h3>
            </div>
            <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center group-hover:scale-110 transition-transform">
              <Icons.ArrowDown className="w-6 h-6" />
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center gap-2">
            <span className="text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">Incoming</span>
            <span className="text-xs text-slate-400">Waiting for payment</span>
          </div>
        </div>

        <div className="group bg-white rounded-xl p-5 border border-slate-200 shadow-sm hover:shadow-md transition-all relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-rose-50 rounded-full blur-2xl -translate-y-1/2 translate-x-1/3"></div>
          <div className="relative z-10 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-500 mb-1">Total Payables (AP)</p>
              <h3 className="text-2xl font-bold text-slate-900 tracking-tight">
                {summaryLoading ? "..." : (summary?.total_ap || 0).toLocaleString("id-ID")}
              </h3>
            </div>
            <div className="w-12 h-12 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center group-hover:scale-110 transition-transform">
              <Icons.ArrowUp className="w-6 h-6" />
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center gap-2">
            <span className="text-xs font-medium text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full">Outgoing</span>
            <span className="text-xs text-slate-400">Bills to pay</span>
          </div>
        </div>

        <div className="group bg-white rounded-xl p-5 border border-slate-200 shadow-sm hover:shadow-md transition-all relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-50 rounded-full blur-2xl -translate-y-1/2 translate-x-1/3"></div>
          <div className="relative z-10 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-500 mb-1">Cash Balance</p>
              <h3 className="text-2xl font-bold text-slate-900 tracking-tight">
                {summaryLoading ? "..." : (summary?.cash_balance || 0).toLocaleString("id-ID")}
              </h3>
            </div>
            <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center group-hover:scale-110 transition-transform">
              <Icons.Wallet className="w-6 h-6" />
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center gap-2">
            <span className="text-xs font-medium text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full">Available</span>
            <span className="text-xs text-slate-400">Current liquidity</span>
          </div>
        </div>
      </div>

      {isOwner && (arAging || apAging) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* AR Aging */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-sm font-semibold text-slate-800">AR Aging Overview</h4>
              <div className="text-xs text-slate-400">Overdue days</div>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex-1 p-3 rounded-lg bg-slate-50 border border-slate-100 text-center">
                <div className="text-xs text-slate-500 mb-1">0-30 Days</div>
                <div className="text-sm font-bold text-indigo-600">{(arAging?.bucket_0_30 || 0).toLocaleString("id-ID")}</div>
              </div>
              <div className="flex-1 p-3 rounded-lg bg-orange-50 border border-orange-100 text-center">
                <div className="text-xs text-orange-600 mb-1">31-60 Days</div>
                <div className="text-sm font-bold text-orange-700">{(arAging?.bucket_31_60 || 0).toLocaleString("id-ID")}</div>
              </div>
              <div className="flex-1 p-3 rounded-lg bg-red-50 border border-red-100 text-center">
                <div className="text-xs text-red-600 mb-1">61+ Days</div>
                <div className="text-sm font-bold text-red-700">{(arAging?.bucket_61_plus || 0).toLocaleString("id-ID")}</div>
              </div>
            </div>
          </div>

          {/* AP Aging */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-sm font-semibold text-slate-800">AP Aging Overview</h4>
              <div className="text-xs text-slate-400">Overdue days</div>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex-1 p-3 rounded-lg bg-slate-50 border border-slate-100 text-center">
                <div className="text-xs text-slate-500 mb-1">0-30 Days</div>
                <div className="text-sm font-bold text-indigo-600">{(apAging?.bucket_0_30 || 0).toLocaleString("id-ID")}</div>
              </div>
              <div className="flex-1 p-3 rounded-lg bg-orange-50 border border-orange-100 text-center">
                <div className="text-xs text-orange-600 mb-1">31-60 Days</div>
                <div className="text-sm font-bold text-orange-700">{(apAging?.bucket_31_60 || 0).toLocaleString("id-ID")}</div>
              </div>
              <div className="flex-1 p-3 rounded-lg bg-red-50 border border-red-100 text-center">
                <div className="text-xs text-red-600 mb-1">61+ Days</div>
                <div className="text-sm font-bold text-red-700">{(apAging?.bucket_61_plus || 0).toLocaleString("id-ID")}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {methodError && (
        <Alert variant="warning" title="Metode pembayaran" description={methodError} />
      )}
      {error && <Alert variant="error" title="Kesalahan" description={error} />}
      {success && (
        <Alert variant="success" title="Berhasil" description={success} />
      )}

      <div className="space-y-6">
        <div className="border-b border-slate-200">
          <nav className="flex space-x-8" aria-label="Tabs">
            <button
              onClick={() => handleTabChange("AR")}
              className={`
                  whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors
                  ${activeTab === "AR"
                  ? "border-indigo-500 text-indigo-600"
                  : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"}
                `}
            >
              Invoices (AR)
            </button>
            <button
              onClick={() => handleTabChange("AP")}
              className={`
                  whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors
                  ${activeTab === "AP"
                  ? "border-rose-500 text-rose-600"
                  : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"}
                `}
            >
              Bills (AP)
            </button>
          </nav>
        </div>

        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
          {activeTab === "AR" && (
            <FinanceARList
              selectedId={selectedId}
              onSelect={handleSelect}
              refreshTrigger={refreshTrigger}
              initialSelectedId={initialArId}
            />
          )}

          {activeTab === "AP" && (
            <FinanceAPList
              selectedId={selectedId}
              onSelect={handleSelect}
              refreshTrigger={refreshTrigger}
              initialSelectedId={initialApId}
            />
          )}
        </div>
      </div>

      <Dialog isOpen={formOpen} onClose={handleCloseForm} contentClassName="max-w-xl">
        <DialogHeader>
          <DialogTitle>{formType === "AR" ? "Terima Pembayaran (AR)" : "Bayar Tagihan (AP)"}</DialogTitle>
        </DialogHeader>
        <DialogContent className="pt-4">
          {formType === "AR" ? (
            <FinanceReceiptForm
              invoiceId={selectedId}
              initialAmount={selectedAmount}
              paymentMethods={paymentMethods}
              onSuccess={handleSuccess}
              onError={handleError}
              embedded
            />
          ) : (
            <FinancePaymentForm
              billId={selectedId}
              initialAmount={selectedAmount}
              paymentMethods={paymentMethods}
              onSuccess={handleSuccess}
              onError={handleError}
              embedded
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
