import {
  BrowserRouter,
  Routes,
  Route,
  Link,
  useLocation,
  Navigate,
} from "react-router-dom";
import { useEffect, useState, lazy, Suspense } from "react";
import { supabase } from "./supabaseClient";
import { Icons } from "./components/ui/Icons";
import { MobileHeader } from "./components/MobileHeader";
import { ErrorBoundary } from "./components/ui/ErrorBoundary";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import RouteOverlayRedirect from "./components/RouteOverlayRedirect";

// Eager load only essential components
import Login from "./components/Login";

// Lazy load all page components
const Customers = lazy(() => import("./components/Customers"));
const CustomerDetail = lazy(() => import("./components/CustomerDetail"));
const Vendors = lazy(() => import("./components/Vendors"));
const VendorDetail = lazy(() => import("./components/VendorDetail"));
const CustomerPricePage = lazy(() => import("./components/CustomerPricePage"));
const COA = lazy(() => import("./components/COA"));
const OpeningBalance = lazy(() => import("./components/OpeningBalance"));
const SalesHistory = lazy(() => import("./components/SalesHistory"));
const PurchaseHistory = lazy(() => import("./components/PurchaseHistory"));
const PurchaseReturnHistory = lazy(
  () => import("./components/PurchaseReturnHistory"),
);
const StockAdjustment = lazy(() => import("./components/StockAdjustment"));
const StockCard = lazy(() => import("./components/StockCard"));
const OpeningStock = lazy(() => import("./components/OpeningStock"));
const SalesReturnHistory = lazy(
  () => import("./components/SalesReturnHistory"),
);
const Finance = lazy(() => import("./components/Finance"));
const Reporting = lazy(() => import("./components/Reporting"));
const PeriodLock = lazy(() => import("./components/PeriodLock"));
const DevResetData = lazy(() => import("./components/DevResetData"));
const Journals = lazy(() => import("./components/Journals"));
const ManualJournal = lazy(() => import("./components/ManualJournal"));
const Dashboard = lazy(() => import("./components/Dashboard"));
const CompanySettings = lazy(() => import("./components/CompanySettings"));
const Attributes = lazy(() => import("./components/Attributes"));
const Items = lazy(() => import("./components/Items"));
const BrandsCategories = lazy(() => import("./components/BrandsCategories"));
const Inventory = lazy(() => import("./components/Inventory"));
const Makloon = lazy(() => import("./components/Makloon"));

import type { Session } from "@supabase/supabase-js";

// ... imports

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      refetchOnWindowFocus: false,
    },
  },
});

function SidebarLink({
  to,
  icon: Icon,
  children,
  end = false,
}: {
  to: string;
  icon: React.ElementType;
  children: React.ReactNode;
  end?: boolean;
}) {
  const location = useLocation();
  const isActive = end
    ? location.pathname === to
    : location.pathname.startsWith(to);

  return (
    <Link
      to={to}
      className={`
        flex items-center gap-2 px-3 py-2 rounded-md transition-all duration-200 text-sm
        ${
          isActive
            ? "bg-slate-800 text-white pl-4 shadow-md shadow-black/20"
            : "text-slate-400 hover:bg-slate-800 hover:text-white hover:pl-4 opacity-80 hover:opacity-100"
        }
      `}
    >
      <Icon
        className={`w-4 h-4 ${isActive ? "text-indigo-400" : "opacity-70 group-hover:opacity-100"}`}
      />
      {children}
    </Link>
  );
}

// ... imports

const isLocalhost = typeof window !== "undefined" && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");

function PageWrapper({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  return (
    <div
      key={location.pathname}
      className="animate-in fade-in slide-in-from-bottom-2 duration-300 fill-mode-both max-w-[1600px] mx-auto"
    >
      {children}
    </div>
  );
}

function NotAuthorized({
  message = "Anda tidak memiliki akses ke halaman ini.",
}: {
  message?: string;
}) {
  return (
    <div className="w-full p-8">
      <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-md flex items-center gap-2">
        <Icons.Warning className="w-5 h-5 flex-shrink-0" />
        {message}
      </div>
    </div>
  );
}

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [userProfile, setUserProfile] = useState<{
    full_name: string | null;
    role: string;
  } | null>(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [periodStatus, setPeriodStatus] = useState<"OPEN" | "CLOSED" | null>(
    null,
  );
  const isOwner = userProfile?.role === "OWNER";
  const canAccessFinance = isOwner;

  const isAdmin = userProfile?.role === "ADMIN";

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) fetchUserProfile(session.user.id);
      else setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) fetchUserProfile(session.user.id);
      else setUserProfile(null);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) return;
    const handleProfileUpdated = () => {
      fetchUserProfile(session.user.id);
    };
    window.addEventListener("user-profile-updated", handleProfileUpdated);
    return () =>
      window.removeEventListener("user-profile-updated", handleProfileUpdated);
  }, [session]);

  useEffect(() => {
    if (!session || (!isOwner && !isAdmin)) {
      setPeriodStatus(null);
      return;
    }
    let active = true;
    const fetchPeriodStatus = async () => {
      try {
        const { data, error } = await supabase
          .from("accounting_periods")
          .select("status")
          .order("end_date", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (error) return;
        if (active)
          setPeriodStatus((data?.status as "OPEN" | "CLOSED") || null);
      } catch {
        if (active) setPeriodStatus(null);
      }
    };
    fetchPeriodStatus();
    return () => {
      active = false;
    };
  }, [session, isOwner, isAdmin]);

  async function fetchUserProfile(userId: string) {
    try {
      const { data, error } = await supabase
        .from("user_profiles")
        .select("full_name, role")
        .eq("id", userId)
        .single();

      if (!error && data) {
        setUserProfile(data);
      }
    } catch (e) {
      console.error("Error fetching profile", e);
    } finally {
      setLoading(false);
    }
  }

  if (loading)
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  if (!session) return <Login />;

  // Ensure RLS works by maybe setting a global context or just letting client handle it
  // (supabase client auto-handles token)

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <div className="flex min-h-screen bg-[var(--bg-surface-alt)] text-[var(--text-main)]">
          {/* Mobile menu backdrop */}
          {mobileMenuOpen && (
            <div
              className="fixed inset-0 bg-black bg-opacity-50 z-50 md:hidden"
              onClick={() => setMobileMenuOpen(false)}
            />
          )}

          {/* Mobile-only header bar */}
          <MobileHeader
            mobileMenuOpen={mobileMenuOpen}
            onToggleMenu={() => setMobileMenuOpen(!mobileMenuOpen)}
            periodStatus={periodStatus}
          />

          {/* Sidebar - Overlay on mobile, fixed on desktop */}
          <nav
            className={`
          fixed md:static inset-y-0 left-0 z-50
          w-64 bg-slate-900/95 backdrop-blur-xl text-slate-300 flex flex-col shadow-2xl border-r border-slate-800/50
          transform transition-transform duration-300 ease-in-out
          ${mobileMenuOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}
        `}
          >
            <div className="p-4 sm:p-6 border-b border-slate-800">
              <div className="flex items-center justify-between mb-4 sm:mb-6">
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white flex items-center gap-2">
                  <img
                    src="/logo.png"
                    alt="Mendjahit"
                    width="32"
                    height="32"
                    className="h-8 w-8 rounded object-contain"
                  />
                  <span className="hidden sm:inline">Mendjahit</span>
                  <span className="sm:hidden">Mendjahit</span>
                </h1>
                {/* Mobile close button */}
                <button
                  onClick={() => setMobileMenuOpen(false)}
                  className="md:hidden p-1 text-slate-400 hover:text-white"
                  aria-label="Close menu"
                >
                  <Icons.Close className="w-6 h-6" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto py-6 px-4 space-y-2 min-h-0">
              {/* Dashboard */}
              <div className="px-2">
                <SidebarLink to="/" icon={Icons.Chart} end={true}>
                  Dashboard
                </SidebarLink>
              </div>

              <div className="space-y-2">
                {/* Transactions Group */}
                <div className="px-2">
                  <SidebarLink to="/sales/history" icon={Icons.FileText}>
                    Sales
                  </SidebarLink>
                </div>
                <div className="px-2">
                  <SidebarLink to="/purchases/history" icon={Icons.FileText}>
                    Purchase
                  </SidebarLink>
                </div>
                <div className="px-2">
                  <SidebarLink to="/makloon" icon={Icons.Factory}>
                    Makloon
                  </SidebarLink>
                </div>

                <div className="px-2">
                  <SidebarLink to="/inventory" icon={Icons.Chart}>
                    Inventory
                  </SidebarLink>
                </div>
                <div className="px-2">
                  <SidebarLink to="/items" icon={Icons.Package}>
                    Master Data
                  </SidebarLink>
                </div>
                <div className="px-2">
                  <SidebarLink to="/customers" icon={Icons.Users}>
                    Customers
                  </SidebarLink>
                </div>
                <div className="px-2">
                  <SidebarLink to="/vendors" icon={Icons.Users}>
                    Vendors
                  </SidebarLink>
                </div>

                {canAccessFinance && (
                  <>
                    <div className="px-2">
                      <SidebarLink to="/finance" icon={Icons.DollarSign}>
                        Finance (AR/AP)
                      </SidebarLink>
                    </div>
                    <div className="px-2">
                      <SidebarLink to="/coa" icon={Icons.FileText}>
                        COA
                      </SidebarLink>
                    </div>
                    <div className="px-2">
                      <SidebarLink to="/journals" icon={Icons.FileText}>
                        Journals
                      </SidebarLink>
                    </div>
                    <div className="px-2">
                      <SidebarLink to="/reports" icon={Icons.Chart}>
                        Finance Reports
                      </SidebarLink>
                    </div>
                  </>
                )}

                {/* System Sidebar Removed - Access via Profile */}
              </div>
            </div>

            {/* User Profile Footer */}
            {session && (
              <div className="shrink-0 border-t border-slate-800 bg-slate-900 relative">
                <button
                  onClick={() => setUserMenuOpen((prev) => !prev)}
                  className="w-full p-4 hover:bg-slate-800 transition-colors group text-left"
                  aria-haspopup="menu"
                  aria-expanded={userMenuOpen}
                >
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-full bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-300 font-bold shadow-sm group-hover:bg-indigo-500/30 transition-colors">
                      {userProfile?.full_name?.charAt(0).toUpperCase() ||
                        session.user.email?.charAt(0).toUpperCase() ||
                        "U"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate group-hover:text-indigo-300 transition-colors">
                        {userProfile?.full_name || "User"}
                      </p>
                      <p className="text-xs text-slate-500 truncate group-hover:text-slate-400">
                        {session.user.email}
                      </p>
                    </div>
                    <Icons.ChevronDown className="w-4 h-4 text-slate-600 group-hover:text-slate-400" />
                  </div>
                </button>
                {userMenuOpen && (
                  <div className="absolute left-0 right-0 bottom-full mb-2 mx-3 rounded-lg border border-slate-700/50 bg-slate-900/95 backdrop-blur-sm shadow-xl overflow-hidden ring-1 ring-white/5">
                    <div className="p-1.5 space-y-0.5">
                      <Link
                        to="/settings"
                        onClick={() => setUserMenuOpen(false)}
                        className="flex items-center gap-3 px-3 py-2.5 text-sm text-slate-200 hover:bg-gradient-to-r hover:from-indigo-500/10 hover:to-purple-500/10 rounded-md transition-all duration-200 group"
                      >
                        <div className="p-1.5 rounded-md bg-slate-800 group-hover:bg-indigo-500/20 transition-colors">
                          <Icons.Settings className="w-4 h-4 text-slate-400 group-hover:text-indigo-400 transition-colors" />
                        </div>
                        <span className="font-medium group-hover:text-white transition-colors">
                          Settings
                        </span>
                      </Link>
                      <div className="h-px bg-gradient-to-r from-transparent via-slate-700 to-transparent my-1" />
                      <button
                        onClick={() => {
                          setUserMenuOpen(false);
                          supabase.auth.signOut();
                        }}
                        className="w-full text-left flex items-center gap-3 px-3 py-2.5 text-sm text-slate-200 hover:bg-gradient-to-r hover:from-red-500/10 hover:to-rose-500/10 rounded-md transition-all duration-200 group"
                      >
                        <div className="p-1.5 rounded-md bg-slate-800 group-hover:bg-red-500/20 transition-colors">
                          <Icons.LogOut className="w-4 h-4 text-slate-400 group-hover:text-red-400 transition-colors" />
                        </div>
                        <span className="font-medium group-hover:text-white transition-colors">
                          Sign Out
                        </span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </nav>
          <main className="flex-1 min-h-screen pt-20 md:pt-0 p-2 sm:p-4 md:p-6 lg:p-8 w-full min-w-0">
            {periodStatus === "CLOSED" && (
              <div className="mb-3 md:mb-4">
                <div className="flex items-center justify-between bg-red-50 border border-red-200 text-red-800 rounded-lg px-4 py-2">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <Icons.Warning className="w-4 h-4" />
                    Period CLOSED
                  </div>
                  <span className="text-xs text-red-600">
                    Transactions are locked for the current period.
                  </span>
                </div>
              </div>
            )}
            <Suspense
              fallback={
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
                    <p className="text-gray-600">Loading...</p>
                  </div>
                </div>
              }
            >
              <ErrorBoundary>
                <PageWrapper>
                  <Routes>
                    <Route path="/customers" element={<Customers />} />
                    <Route path="/customers/:id" element={<CustomerDetail />} />
                    <Route
                      path="/customers/:id/pricing"
                      element={<CustomerPricePage />}
                    />
                    <Route path="/vendors" element={<Vendors />} />
                    <Route path="/vendors/:id" element={<VendorDetail />} />
                    <Route path="/coa" element={<COA />} />
                    <Route
                      path="/opening-balance"
                      element={
                        isOwner ? (
                          <OpeningBalance />
                        ) : (
                          <NotAuthorized message="Halaman Opening Balance hanya untuk OWNER." />
                        )
                      }
                    />
                    <Route path="/sales" element={<RouteOverlayRedirect to="/sales/history" modal="sales.create" />} />
                    <Route path="/sales/history" element={<SalesHistory />} />
                    <Route path="/sales/:id" element={<RouteOverlayRedirect to="/sales/history" modal="sales.detail" valueParams={{ id: "id" }} />} />
                    <Route path="/sales/:id/edit" element={<RouteOverlayRedirect to="/sales/history" modal="sales.edit" valueParams={{ id: "id" }} />} />
                    <Route path="/sales-return" element={<RouteOverlayRedirect to="/sales/history" modal="salesReturn.create" />} />
                    <Route
                      path="/sales-returns/history"
                      element={<SalesReturnHistory />}
                    />
                    <Route
                      path="/sales-returns/:id"
                      element={<RouteOverlayRedirect to="/sales/history" modal="salesReturn.detail" valueParams={{ id: "id" }} />}
                    />
                    <Route path="/purchases" element={<RouteOverlayRedirect to="/purchases/history" modal="purchase.create" />} />
                    <Route
                      path="/purchases/history"
                      element={<PurchaseHistory />}
                    />
                    <Route path="/purchases/:id" element={<RouteOverlayRedirect to="/purchases/history" modal="purchase.detail" valueParams={{ id: "id" }} />} />
                    <Route
                      path="/purchases/:id/edit"
                      element={<RouteOverlayRedirect to="/purchases/history" modal="purchase.edit" valueParams={{ id: "id" }} />}
                    />
                    <Route
                      path="/purchase-return"
                      element={<RouteOverlayRedirect to="/purchases/history" modal="purchaseReturn.create" />}
                    />
                    <Route
                      path="/purchase-returns/history"
                      element={<PurchaseReturnHistory />}
                    />
                    <Route
                      path="/purchase-returns/:id"
                      element={<RouteOverlayRedirect to="/purchases/history" modal="purchaseReturn.detail" valueParams={{ id: "id" }} />}
                    />
                    <Route
                      path="/finance"
                      element={
                        canAccessFinance ? <Finance /> : <NotAuthorized />
                      }
                    />
                    <Route path="/inventory" element={<Inventory />} />
                    <Route path="/stock-adj" element={<StockAdjustment />} />
                    <Route path="/opening-stock" element={<OpeningStock />} />
                    <Route path="/stock-card" element={<StockCard />} />
                    <Route
                      path="/journals"
                      element={
                        canAccessFinance ? <Journals /> : <NotAuthorized />
                      }
                    />
                    <Route
                      path="/journals/manual"
                      element={
                        canAccessFinance ? <ManualJournal /> : <NotAuthorized />
                      }
                    />
                    <Route
                      path="/reports"
                      element={
                        canAccessFinance ? <Reporting /> : <NotAuthorized />
                      }
                    />
                    <Route
                      path="/period-lock"
                      element={
                        canAccessFinance ? <PeriodLock /> : <NotAuthorized />
                      }
                    />
                    <Route
                      path="/period-reports"
                      element={<Navigate to="/reports" replace />}
                    />
                    <Route path="/settings" element={<CompanySettings />} />
                    <Route path="/attributes" element={<Attributes />} />
                    <Route
                      path="/brands-categories"
                      element={<BrandsCategories />}
                    />
                    <Route path="/items" element={<Items />} />
                    <Route path="/makloon/*" element={<Makloon />} />
                    {/* DEV ONLY Route */}
                    {isLocalhost && (
                      <Route path="/dev-reset" element={<DevResetData />} />
                    )}
                    <Route path="/" element={<Dashboard isOwner={isOwner} />} />
                  </Routes>
                </PageWrapper>
              </ErrorBoundary>
            </Suspense>
          </main>
        </div>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
