import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { useAuth } from "@/context/AuthContext";
import { useQueryClient } from "@tanstack/react-query";
import { getGetMeQueryKey, getMe } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { getCsrfToken, setCsrfToken } from "@/lib/csrf";
import { apiUrl } from "@/lib/api-base";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [, navigate] = useLocation();
  const search = useSearch();
  const { setUser } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState("");
  const [showLogoutToast, setShowLogoutToast] = useState(false);

  const nextParam = new URLSearchParams(search).get("next");
  const nextPath = nextParam && nextParam.startsWith("/") ? nextParam : "/dashboard";
  const showLoggedOut = useMemo(() => new URLSearchParams(search).get("logged_out") === "1", [search]);

  useEffect(() => {
    if (!showLoggedOut) return;
    setShowLogoutToast(true);
    const id = window.setTimeout(() => setShowLogoutToast(false), 3000);
    return () => window.clearTimeout(id);
  }, [showLoggedOut]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErrorText("");
    try {
      const csrfRes = await fetch(apiUrl("/api/auth/csrf-token"), { method: "GET", credentials: "include" });
      const csrfRaw = await csrfRes.text();
      const csrfData = csrfRaw ? (() => {
        try { return JSON.parse(csrfRaw); } catch { return {}; }
      })() : {};
      const token = (csrfData as { csrfToken?: string }).csrfToken ?? null;
      setCsrfToken(token);

      const csrfHeader = token ?? getCsrfToken();
      const res = await fetch(apiUrl("/api/auth/login"), {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(csrfHeader ? { "x-csrf-token": csrfHeader } : {}),
        },
        body: JSON.stringify({ email, password }),
      });

      const raw = await res.text();
      const data = raw ? (() => {
        try { return JSON.parse(raw); } catch { return { message: raw }; }
      })() : {};

      if (!res.ok) {
        const message = (data as any).message ?? (data as any).error ?? "Invalid email or password";
        setErrorText(message);
        toast({
          title: "Login failed",
          description: message,
          variant: "destructive",
        });
        return;
      }

      try {
        await queryClient.fetchQuery({
          queryKey: getGetMeQueryKey(),
          queryFn: ({ signal }) => getMe({ signal }),
        });
      } catch {
        toast({
          title: "Could not sync session",
          description: "Try refreshing the page. If this persists, check cookie/session settings.",
          variant: "destructive",
        });
      }
      setUser((data as any).user as any);
      toast({ title: "Welcome back!", description: `Logged in as ${(data as any).user?.name ?? "user"}` });
      navigate(nextPath);
    } catch (err: any) {
      setErrorText(err?.message ?? "Network error");
      toast({
        title: "Login failed",
        description: err?.message ?? "Network error",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-5 py-8 bg-[#0a1628]">
      {showLogoutToast && (
        <div
          className="fixed top-5 left-1/2 -translate-x-1/2 z-[80] px-5 py-3 rounded-xl text-sm font-medium"
          style={{ background: "#0d1b2a", border: "1px solid rgba(16, 185, 129, 0.2)", color: "#10b981" }}
        >
          Logged out successfully ✓
        </div>
      )}
      <div className="w-full max-w-[420px] rounded-[20px] border px-8 py-10 login-card-fade"
        style={{ background: "#0d1b2a", borderColor: "rgba(255,255,255,0.06)" }}>
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2.5">
            <span className="w-7 h-7 rounded-md inline-flex items-center justify-center" style={{ background: "#10b981" }}>
              <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 11V8a4 4 0 118 0v3m-9 0h10a1 1 0 011 1v7H6v-7a1 1 0 011-1z" />
              </svg>
            </span>
            <h1 className="text-xl font-bold">
              <span className="text-white">Secure</span>
              <span className="text-[#10b981]">Pool</span>
            </h1>
          </Link>
          <p className="text-[13px] mt-2 text-[#64748b]">Trusted USDT lucky draw platform</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
              {errorText ? (
                <div className="login-error">
                  {errorText}
                </div>
              ) : null}
              <input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email or username"
                required
                className="w-full min-h-12 rounded-xl px-4 text-sm outline-none"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "#fff" }}
              />
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password"
                  required
                  className="w-full min-h-12 rounded-xl px-4 pr-12 text-sm outline-none"
                  style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "#fff" }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#64748b]"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? "🙈" : "👁"}
                </button>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full h-12 rounded-xl font-semibold text-white disabled:opacity-60 disabled:cursor-not-allowed mt-2"
                style={{ background: loading ? "#0d9668" : "#10b981" }}
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Signing in…
                  </span>
                ) : "Login"}
              </button>
          </form>

        <a href="#" className="forgot-link">Forgot your password?</a>
        <div className="login-divider"><span>or</span></div>
        <Link href="/signup">
          <button className="w-full h-11 rounded-xl text-sm font-semibold border border-[#10b981] text-[#10b981] hover:bg-[rgba(16,185,129,0.08)]">
            Create Account
          </button>
        </Link>
        <div className="flex justify-center gap-5 mt-6 text-[11px] text-[#475569]">
          <span>🔒 Secure</span>
          <span>✅ Verified</span>
          <span>🌐 TRC-20</span>
        </div>
      </div>
    </div>
  );
}
