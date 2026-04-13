import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Suspense, lazy, useEffect } from "react";
import { useLocation } from "wouter";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/context/AuthContext";
import { CelebrationProvider } from "@/context/CelebrationContext";
import { useAuth } from "@/context/AuthContext";
import { Layout } from "@/components/Layout";
import { InstallPrompt } from "@/components/InstallPrompt";
import { PageLoading } from "@/components/PageLoading";
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
const ArcadeGamePlay = lazy(() =>
  import("@/components/games/ArcadeGamePlay").then((m) => ({ default: m.ArcadeGamePlay })),
);

function PageFallback() {
  return <PageLoading />;
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

  if (isLoading) return <PageLoading />;
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
  const [, navigate] = useLocation();

  useEffect(() => {
    if (user) navigate("/dashboard");
  }, [user, navigate]);

  // Do not gate on isLoading: cross-origin /me can leave the login route blank while pending.
  if (user) return null;
  return <>{children}</>;
}

function PersistAndRestoreRoute() {
  const { isLoading } = useAuth();
  const [location, navigate] = useLocation();

  useEffect(() => {
    if (typeof window === "undefined") return;
    const isAuthPage = location.startsWith("/login") || location.startsWith("/signup");
    if (!isAuthPage && location) {
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

function Router() {
  return (
    <Layout>
      <PersistAndRestoreRoute />
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
            <P2PTradingPage />
          </RequireAuth>
        </Route>
        <Route path="/games">
          <RequireAuth>
            <Suspense fallback={<PageFallback />}>
              <GamesPage />
            </Suspense>
          </RequireAuth>
        </Route>
        <Route path="/games/spin-wheel">
          <RequireAuth>
            <Suspense fallback={<PageFallback />}>
              <ArcadeGamePlay game="spin" />
            </Suspense>
          </RequireAuth>
        </Route>
        <Route path="/games/mystery-box">
          <RequireAuth>
            <Suspense fallback={<PageFallback />}>
              <ArcadeGamePlay game="box" />
            </Suspense>
          </RequireAuth>
        </Route>
        <Route path="/games/scratch-card">
          <RequireAuth>
            <Suspense fallback={<PageFallback />}>
              <ArcadeGamePlay game="scratch" />
            </Suspense>
          </RequireAuth>
        </Route>
        <Route path="/games/hi-lo">
          <RequireAuth>
            <Suspense fallback={<PageFallback />}>
              <ArcadeGamePlay game="hilo" />
            </Suspense>
          </RequireAuth>
        </Route>
        <Route path="/games/mega-draw">
          <RequireAuth>
            <Suspense fallback={<PageFallback />}>
              <ArcadeGamePlay game="mega" />
            </Suspense>
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
            <CelebrationProvider>
              <Router />
            </CelebrationProvider>
          </AuthProvider>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
