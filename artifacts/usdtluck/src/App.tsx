import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Component, Suspense, lazy, useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/context/AuthContext";
import { CelebrationProvider } from "@/context/CelebrationContext";
import { SPTToastProvider } from "@/components/spt/SPTToastContext";
import { useAuth } from "@/context/AuthContext";
import { Layout } from "@/components/Layout";
import { InstallPrompt } from "@/components/InstallPrompt";
import { PageLoading } from "@/components/PageLoading";
import { Spinner } from "@/components/ui/spinner";
import NotFound from "@/pages/not-found";
import LandingPage from "@/pages/LandingPage";
import LoginPage from "@/pages/LoginPage";
import SignupPage from "@/pages/SignupPage";
import DashboardPage from "@/pages/DashboardPage";
import PoolsPage from "@/pages/PoolsPage";
import PoolDetailPage from "@/pages/PoolDetailPage";
import WalletPage from "@/pages/WalletPage";
import WinnersPage from "@/pages/WinnersPage";
import ProfilePage from "@/pages/ProfilePage";
import VerifyEmailPage from "@/pages/VerifyEmailPage";
import AdminPage from "@/pages/AdminPage";
import AdminSupportPage from "@/pages/AdminSupportPage";
import ReviewsPage from "@/pages/ReviewsPage";
import HowItWorksPage from "@/pages/HowItWorksPage";
import ProvablyFairPage from "@/pages/ProvablyFairPage";
import RewardsPage from "@/pages/RewardsPage";
import StakingPage from "@/pages/StakingPage";
import ReferralPage from "@/pages/ReferralPage";
import MyTicketsPage from "@/pages/MyTicketsPage";
import P2PTradingPage from "@/pages/P2PTradingPage";
import CashoutArenaRedirect from "@/pages/CashoutArenaRedirect";
import ScratchCardRedirect from "@/pages/ScratchCardRedirect";
import MySharesPage from "@/pages/MySharesPage";
import RefRedirectPage from "@/pages/RefRedirectPage";
import HowToBuyUsdtPage from "@/pages/HowToBuyUsdtPage";

const GamesPage = lazy(() => import("@/pages/GamesPage"));
const SptPage = lazy(() => import("@/pages/SptPage"));
const ArcadeGamePlay = lazy(() =>
  import("@/components/games/ArcadeGamePlay").then((m) => ({ default: m.ArcadeGamePlay })),
);

function PageFallback() {
  return null;
}

class LazyRouteBoundary extends Component<{ children: React.ReactNode }, { err: unknown }> {
  state: { err: unknown } = { err: null };
  static getDerivedStateFromError(err: unknown) {
    return { err };
  }
  render() {
    if (this.state.err) {
      return (
        <div className="sp-ambient-bg flex min-h-[50vh] items-center justify-center px-4 py-14">
          <div className="mx-auto max-w-md rounded-3xl border border-white/10 bg-white/[0.03] p-8 text-center shadow-[0_18px_60px_rgba(0,0,0,0.45)] backdrop-blur-xl space-y-3">
            <p className="text-2xl">⚠️</p>
            <h2 className="font-sp-display text-xl font-bold text-white">Update available</h2>
            <p className="text-sm text-sp-text-dim">
              Your browser is loading an older version of the app. Please reload to get the latest game pages.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-2 inline-flex h-11 items-center justify-center rounded-2xl bg-gradient-to-r from-[var(--green)] to-[var(--green-hover)] px-6 font-sp-display text-sm font-extrabold text-[var(--green-text)]"
            >
              Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
});

const LAST_ROUTE_KEY = "securepool:last-route";

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const [location, navigate] = useLocation();

  useEffect(() => {
    if (!isLoading && !user) {
      const next = encodeURIComponent(location || "/");
      navigate(`/login?next=${next}`);
    }
  }, [user, isLoading, navigate, location]);

  if (isLoading) return null;
  if (!user) return null;
  return <>{children}</>;
}

function RedirectToWalletTab({ tab }: { tab: "deposit" | "withdraw" | "history" }) {
  const [, navigate] = useLocation();
  useEffect(() => {
    navigate(`/wallet?tab=${tab}`);
  }, [navigate, tab]);
  return null;
}

function RequireGuest({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [location, navigate] = useLocation();

  useEffect(() => {
    if (!user) return;
    if (typeof window === "undefined") return;
    const qs = location.includes("?") ? location.slice(location.indexOf("?") + 1) : "";
    const nextParam = new URLSearchParams(qs).get("next");
    const next = nextParam ? decodeURIComponent(nextParam) : null;
    const saved = window.sessionStorage.getItem(LAST_ROUTE_KEY);
    const target =
      next && next.startsWith("/") && !next.startsWith("/login") && !next.startsWith("/signup")
        ? next
        : saved && saved.startsWith("/") && !saved.startsWith("/login") && !saved.startsWith("/signup") && saved !== "/"
          ? saved
          : "/dashboard";
    navigate(target, { replace: true });
  }, [user, navigate, location]);

  // Do not gate on isLoading: cross-origin /me can leave the login route blank while pending.
  if (user) return null;
  return <>{children}</>;
}

function P2PAdminOnly() {
  const { user, isLoading } = useAuth();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (isLoading) return;
    if (!user) return;
    if (!user.isAdmin) navigate("/dashboard", { replace: true });
  }, [user, isLoading, navigate]);

  if (isLoading) return null;
  if (!user) return null;
  if (!user.isAdmin) return null;
  return <P2PTradingPage />;
}

function PersistAndRestoreRoute() {
  const { isLoading } = useAuth();
  const [location, navigate] = useLocation();

  useEffect(() => {
    if (typeof window === "undefined") return;
    const isAuthPage = location.startsWith("/login") || location.startsWith("/signup");
    if (!isAuthPage && location && location !== "/") {
      window.sessionStorage.setItem(LAST_ROUTE_KEY, location || "/dashboard");
    }
  }, [location, isLoading]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isLoading) return;
    if (location !== "/") return;
    const saved = window.sessionStorage.getItem(LAST_ROUTE_KEY);
    if (!saved || saved === "/" || saved.startsWith("/login") || saved.startsWith("/signup")) return;
    navigate(saved);
  }, [location, navigate, isLoading]);

  return null;
}

function RouteChangeLoader() {
  const [location] = useLocation();
  const [show, setShow] = useState(false);

  useEffect(() => {
    // Show immediately on route change, hide shortly after paint.
    setShow(true);
    const raf = window.requestAnimationFrame(() => {
      // Small minimum duration to avoid flicker.
      window.setTimeout(() => setShow(false), 420);
    });
    return () => window.cancelAnimationFrame(raf);
  }, [location]);

  if (!show) return null;
  return (
    <div className="fixed inset-x-0 top-0 z-[60] pointer-events-none">
      {/* Glow wash */}
      <div className="absolute inset-x-0 top-0 h-10 bg-gradient-to-b from-[rgba(0,194,168,0.10)] via-[rgba(0,194,168,0.05)] to-transparent" />

      {/* Progress bar */}
      <div className="relative h-[3px] w-full bg-white/5">
        <div
          className="h-full w-[68%] bg-[var(--green)] shadow-[0_0_18px_rgba(0,194,168,0.35)] animate-pulse"
          style={{ filter: "saturate(1.2)" }}
        />
        <div className="absolute -bottom-2 left-0 right-0 h-6 blur-xl bg-[rgba(0,194,168,0.15)]" />
      </div>

      {/* Tiny indicator (optional, subtle) */}
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mt-2 inline-flex items-center gap-2 text-[11px] font-semibold text-[var(--green)]/80">
          <Spinner className="size-3.5 text-[var(--green)]/80" />
          Loading
        </div>
      </div>
    </div>
  );
}

function Router() {
  return (
    <Layout>
      <PersistAndRestoreRoute />
      {/* Page loader disabled for now */}
      <InstallPrompt />
      <Switch>
        <Route path="/" component={LandingPage} />
        <Route path="/login">
          <RequireGuest>
            <LoginPage />
          </RequireGuest>
        </Route>
        <Route path="/signup">
          <RequireGuest>
            <SignupPage />
          </RequireGuest>
        </Route>

        <Route path="/dashboard">
          <RequireAuth>
            <DashboardPage />
          </RequireAuth>
        </Route>
        <Route path="/pools">
          <RequireAuth>
            <PoolsPage />
          </RequireAuth>
        </Route>
        <Route path="/pools/:poolId">
          <RequireAuth>
            <PoolDetailPage />
          </RequireAuth>
        </Route>
        <Route path="/wallet">
          <RequireAuth>
            <WalletPage />
          </RequireAuth>
        </Route>
        <Route path="/upload">
          <RequireAuth>
            <RedirectToWalletTab tab="deposit" />
          </RequireAuth>
        </Route>
        <Route path="/deposit">
          <RequireAuth>
            <RedirectToWalletTab tab="deposit" />
          </RequireAuth>
        </Route>
        <Route path="/winners">
          <RequireAuth>
            <WinnersPage />
          </RequireAuth>
        </Route>
        <Route path="/profile">
          <RequireAuth>
            <ProfilePage />
          </RequireAuth>
        </Route>
        <Route path="/verify-email">
          <RequireAuth>
            <VerifyEmailPage />
          </RequireAuth>
        </Route>
        <Route path="/admin">
          <RequireAuth>
            <AdminPage />
          </RequireAuth>
        </Route>
        <Route path="/admin/support">
          <RequireAuth>
            <AdminSupportPage />
          </RequireAuth>
        </Route>
        <Route path="/reviews">
          <RequireAuth>
            <ReviewsPage />
          </RequireAuth>
        </Route>
        <Route path="/staking">
          <RequireAuth>
            <StakingPage />
          </RequireAuth>
        </Route>
        <Route path="/referral">
          <RequireAuth>
            <ReferralPage />
          </RequireAuth>
        </Route>
        <Route path="/rewards">
          <RequireAuth>
            <RewardsPage />
          </RequireAuth>
        </Route>
        <Route path="/my-tickets">
          <RequireAuth>
            <MyTicketsPage />
          </RequireAuth>
        </Route>
        <Route path="/p2p">
          <RequireAuth>
            <P2PAdminOnly />
          </RequireAuth>
        </Route>
        <Route path="/games/spin-wheel">
          <RequireAuth>
            <LazyRouteBoundary>
              <Suspense fallback={<PageFallback />}>
                <ArcadeGamePlay game="spin" />
              </Suspense>
            </LazyRouteBoundary>
          </RequireAuth>
        </Route>
        <Route path="/games/mystery-box">
          <RequireAuth>
            <LazyRouteBoundary>
              <Suspense fallback={<PageFallback />}>
                <ArcadeGamePlay game="box" />
              </Suspense>
            </LazyRouteBoundary>
          </RequireAuth>
        </Route>
        <Route path="/games/scratch-card">
          <RequireAuth>
            <LazyRouteBoundary>
              <Suspense fallback={<PageFallback />}>
                <ArcadeGamePlay game="scratch" />
              </Suspense>
            </LazyRouteBoundary>
          </RequireAuth>
        </Route>
        <Route path="/games/hi-lo">
          <RequireAuth>
            <LazyRouteBoundary>
              <Suspense fallback={<PageFallback />}>
                <ArcadeGamePlay game="hilo" />
              </Suspense>
            </LazyRouteBoundary>
          </RequireAuth>
        </Route>
        <Route path="/games/mega-draw">
          <RequireAuth>
            <LazyRouteBoundary>
              <Suspense fallback={<PageFallback />}>
                <ArcadeGamePlay game="mega" />
              </Suspense>
            </LazyRouteBoundary>
          </RequireAuth>
        </Route>
        <Route path="/games">
          <RequireAuth>
            <LazyRouteBoundary>
              <Suspense fallback={<PageFallback />}>
                <GamesPage />
              </Suspense>
            </LazyRouteBoundary>
          </RequireAuth>
        </Route>
        <Route path="/spt">
          <RequireAuth>
            <LazyRouteBoundary>
              <Suspense fallback={<PageFallback />}>
                <SptPage />
              </Suspense>
            </LazyRouteBoundary>
          </RequireAuth>
        </Route>
        <Route path="/cashout-arena">
          <RequireAuth>
            <CashoutArenaRedirect />
          </RequireAuth>
        </Route>
        <Route path="/scratch-card">
          <RequireAuth>
            <ScratchCardRedirect />
          </RequireAuth>
        </Route>
        <Route path="/my-shares">
          <RequireAuth>
            <MySharesPage />
          </RequireAuth>
        </Route>
        <Route path="/ref/:code" component={RefRedirectPage} />
        <Route path="/how-to-buy-usdt" component={HowToBuyUsdtPage} />
        <Route path="/how-it-works" component={HowItWorksPage} />
        <Route path="/provably-fair" component={ProvablyFairPage} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <AuthProvider>
            <SPTToastProvider>
              <CelebrationProvider>
                <Router />
              </CelebrationProvider>
            </SPTToastProvider>
          </AuthProvider>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
