import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, lazy, Suspense } from "react";
import { useLocation } from "wouter";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/context/AuthContext";
import { CelebrationProvider } from "@/context/CelebrationContext";
import { useAuth } from "@/context/AuthContext";
import { Layout } from "@/components/Layout";
import { PageLoading } from "@/components/PageLoading";

const NotFound = lazy(() => import("@/pages/not-found"));
const LandingPage = lazy(() => import("@/pages/LandingPage"));
const LoginPage = lazy(() => import("@/pages/LoginPage"));
const SignupPage = lazy(() => import("@/pages/SignupPage"));
const DashboardPage = lazy(() => import("@/pages/DashboardPage"));
const PoolsPage = lazy(() => import("@/pages/PoolsPage"));
const PoolDetailPage = lazy(() => import("@/pages/PoolDetailPage"));
const WalletPage = lazy(() => import("@/pages/WalletPage"));
const WinnersPage = lazy(() => import("@/pages/WinnersPage"));
const ProfilePage = lazy(() => import("@/pages/ProfilePage"));
const VerifyEmailPage = lazy(() => import("@/pages/VerifyEmailPage"));
const AdminPage = lazy(() => import("@/pages/AdminPage"));
const ReviewsPage = lazy(() => import("@/pages/ReviewsPage"));
const HowItWorksPage = lazy(() => import("@/pages/HowItWorksPage"));
const RewardsPage = lazy(() => import("@/pages/RewardsPage"));
const StakingPage = lazy(() => import("@/pages/StakingPage"));
const ReferralPage = lazy(() => import("@/pages/ReferralPage"));
const MyTicketsPage = lazy(() => import("@/pages/MyTicketsPage"));
const P2PTradingPage = lazy(() => import("@/pages/P2PTradingPage"));
const CashoutArenaPage = lazy(() => import("@/pages/CashoutArenaPage"));
const ScratchCardPage = lazy(() => import("@/pages/ScratchCardPage"));

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
      <Suspense fallback={<PageLoading />}>
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
          <Route path="/cashout-arena">
            <RequireAuth>
              <CashoutArenaPage />
            </RequireAuth>
          </Route>
          <Route path="/scratch-card">
            <RequireAuth>
              <ScratchCardPage />
            </RequireAuth>
          </Route>
          <Route path="/how-it-works" component={HowItWorksPage} />
          <Route component={NotFound} />
        </Switch>
      </Suspense>
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
