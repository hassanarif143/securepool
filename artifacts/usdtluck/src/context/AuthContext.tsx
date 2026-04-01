import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useGetMe, useLogout } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { getGetMeQueryKey } from "@workspace/api-client-react";

interface UserType {
  id: number;
  name: string;
  email: string;
  walletBalance: number;
  isAdmin: boolean;
  joinedAt: string;
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

  const { data, isLoading } = useGetMe({
    query: {
      queryKey: getGetMeQueryKey(),
      retry: false,
      refetchOnWindowFocus: false,
    },
  });

  useEffect(() => {
    if (data) {
      setUser(data as UserType);
    }
  }, [data]);

  function logout() {
    logoutMutation.mutate(undefined, {
      onSuccess: () => {
        setUser(null);
        queryClient.clear();
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
