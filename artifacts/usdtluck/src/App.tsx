import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect } from "react";
import { useLocation } from "wouter";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/context/AuthContext";
import { useAuth } from "@/context/AuthContext";
import { Layout } from "@/components/Layout";
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
import AdminPage from "@/pages/AdminPage";
import ReferralPage from "@/pages/ReferralPage";
import ReviewsPage from "@/pages/ReviewsPage";
import LeaderboardPage from "@/pages/LeaderboardPage";
import HowItWorksPage from "@/pages/HowItWorksPage";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
});

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

function Router() {
  return (
    <Layout>
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
        <Route path="/admin">
          <RequireAuth>
            <AdminPage />
          </RequireAuth>
        </Route>
        <Route path="/referral">
          <RequireAuth>
            <ReferralPage />
          </RequireAuth>
        </Route>
        <Route path="/reviews">
          <RequireAuth>
            <ReviewsPage />
          </RequireAuth>
        </Route>
        <Route path="/leaderboard">
          <RequireAuth>
            <LeaderboardPage />
          </RequireAuth>
        </Route>
        <Route path="/how-it-works" component={HowItWorksPage} />
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
            <Router />
          </AuthProvider>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
