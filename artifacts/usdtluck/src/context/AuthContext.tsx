import { createContext, useContext, useState, useEffect, useLayoutEffect, ReactNode } from "react";
import { useGetMe, useLogout } from "@workspace/api-client-react";
import { setSessionAccessToken } from "@/lib/auth-token";
import { useQueryClient } from "@tanstack/react-query";
import { getGetMeQueryKey } from "@workspace/api-client-react";
import { useLocation } from "wouter";

function getErrorStatus(err: unknown): number | undefined {
  if (typeof err !== "object" || err === null || !("status" in err)) return undefined;
  const s = (err as { status: unknown }).status;
  return typeof s === "number" ? s : undefined;
}

interface UserType {
  id: number;
  name: string;
  email: string;
  phone?: string | null;
  city?: string | null;
  walletBalance: number;
  rewardPoints?: number;
  bonusBalance?: number;
  withdrawableBalance?: number;
  cryptoAddress: string | null;
  isAdmin: boolean;
  joinedAt: string;
  tier: string;
  tierPoints: number;
  referralPoints?: number;
  freeEntries?: number;
  poolJoinCount?: number;
  poolVipTier?: string;
  totalWins?: number;
  firstWinAt?: string | null;
  emailVerified?: boolean;
}

interface AuthContextType {
  user: UserType | null;
  isLoading: boolean;
  setUser: (user: UserType | null) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserType | null>(null);
  const queryClient = useQueryClient();
  const logoutMutation = useLogout();
  const [, navigate] = useLocation();

  const { data, isLoading, isError, error, isFetched } = useGetMe({
    query: {
      queryKey: getGetMeQueryKey(),
      retry: false,
      // Avoid aggressive focus refetch; this caused false logout on tab switches.
      refetchOnWindowFocus: false,
      staleTime: 30_000,
      refetchInterval: 2 * 60 * 1000,
      refetchIntervalInBackground: false,
    },
  });

  useEffect(() => {
    if (!data) return;
    if (isError) {
      const st = getErrorStatus(error);
      if (st === 401 || st === 403) return;
    }
    const d = data as UserType;
    setUser({
      ...d,
      rewardPoints: d.rewardPoints ?? 0,
      bonusBalance: d.bonusBalance ?? 0,
      withdrawableBalance: d.withdrawableBalance ?? 0,
      emailVerified: d.emailVerified !== false,
    });
  }, [data, isError, error]);

  useLayoutEffect(() => {
    if (!isFetched || !isError) return;
    const status = getErrorStatus(error);
    // Only clear user when unauthorized and no usable profile payload exists.
    // This prevents brief cross-domain request glitches from logging users out.
    if ((status === 401 || status === 403) && !data) {
      setUser(null);
    }
  }, [isFetched, isError, error, data]);

  function logout() {
    logoutMutation.mutate(undefined, {
      onSuccess: () => {
        setSessionAccessToken(null);
        setUser(null);
        queryClient.clear();
        navigate("/login");
      },
      onError: () => {
        setSessionAccessToken(null);
        setUser(null);
        queryClient.clear();
        navigate("/login");
      },
    });
  }

  return (
    <AuthContext.Provider value={{ user, isLoading, setUser, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
