import { useState, useEffect, useMemo } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { useAuth } from "@/context/AuthContext";
import { useQueryClient } from "@tanstack/react-query";
import { getGetMeQueryKey, getMe } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { getCsrfToken, setCsrfToken } from "@/lib/csrf";
import { apiUrl } from "@/lib/api-base";
import { trc20ValidationMessage, TRC20_ADDRESS_REGEX } from "@/lib/trc20";

function PasswordStrength({ password }: { password: string }) {
  const checks = [
    { label: "6+ characters", pass: password.length >= 6 },
    { label: "Letter", pass: /[a-zA-Z]/.test(password) },
    { label: "Number", pass: /\d/.test(password) },
  ];
  const score = checks.filter((c) => c.pass).length;
  const colors = ["hsl(0,72%,51%)", "hsl(38,92%,50%)", "hsl(152,72%,44%)"];
  const labels = ["Weak", "Fair", "Strong"];

  if (!password) return null;

  return (
    <div className="space-y-1.5 mt-1.5">
      <div className="flex gap-1.5">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex-1 h-1 rounded-full transition-all"
            style={{ background: i < score ? colors[score - 1] : "hsl(217,28%,18%)" }} />
        ))}
      </div>
      <div className="flex items-center justify-between">
        <div className="flex gap-3">
          {checks.map((c) => (
            <span key={c.label} className="flex items-center gap-1 text-[10px]"
              style={{ color: c.pass ? "hsl(152,72%,55%)" : "hsl(215,16%,47%)" }}>
              <span>{c.pass ? "✓" : "○"}</span> {c.label}
            </span>
          ))}
        </div>
        <span className="text-[10px] font-medium" style={{ color: colors[score - 1] ?? "transparent" }}>
          {password ? labels[score - 1] ?? "Strong" : ""}
        </span>
      </div>
    </div>
  );
}

export default function SignupPage() {
  const [name, setName] = useState("");
  const [cryptoAddress, setCryptoAddress] = useState("");
  const [cryptoAddressConfirm, setCryptoAddressConfirm] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [referralCode, setReferralCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [, navigate] = useLocation();
  const search = useSearch();
  const { setUser } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const nextParam = new URLSearchParams(search).get("next");
  const nextPath = nextParam && nextParam.startsWith("/") ? nextParam : "/dashboard";

  useEffect(() => {
    const params = new URLSearchParams(search);
    const ref = params.get("ref");
    if (ref) setReferralCode(ref.toUpperCase());
  }, [search]);

  const addrPhase = trc20ValidationMessage(cryptoAddress);
  const hasWalletInput = cryptoAddress.trim().length > 0 || cryptoAddressConfirm.trim().length > 0;
  const addressesMatch =
    cryptoAddress.trim() === cryptoAddressConfirm.trim() && cryptoAddress.trim().length > 0;
  const canSubmit = useMemo(() => {
    if (name.trim().length < 2 || !email.trim() || password.length < 6) return false;
    if (hasWalletInput) {
      if (!TRC20_ADDRESS_REGEX.test(cryptoAddress.trim())) return false;
      if (cryptoAddress.trim() !== cryptoAddressConfirm.trim()) return false;
    }
    return true;
  }, [name, email, password, cryptoAddress, cryptoAddressConfirm, hasWalletInput]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) {
      toast({
        title: "Please check your form",
        description: hasWalletInput
          ? !TRC20_ADDRESS_REGEX.test(cryptoAddress.trim())
            ? "Enter a valid TRC20 address (T + 33 letters/numbers)."
            : "Both wallet fields must match exactly."
          : "Please complete required fields.",
        variant: "destructive",
      });
      return;
    }
    setLoading(true);
    try {
      // Ensure CSRF cookie exists before first state-changing request.
      const csrfRes = await fetch(apiUrl("/api/auth/csrf-token"), { method: "GET", credentials: "include" });
      const csrfRaw = await csrfRes.text();
      const csrfData = csrfRaw ? (() => {
        try { return JSON.parse(csrfRaw); } catch { return {}; }
      })() : {};
      const token = (csrfData as { csrfToken?: string }).csrfToken ?? null;
      setCsrfToken(token);

      const csrfHeader = token ?? getCsrfToken();
      const res = await fetch(apiUrl("/api/auth/signup"), {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(csrfHeader ? { "x-csrf-token": csrfHeader } : {}),
        },
        body: JSON.stringify({
          name,
          cryptoAddress: cryptoAddress.trim() || undefined,
          cryptoAddressConfirm: cryptoAddressConfirm.trim() || undefined,
          email,
          password,
          referralCode: referralCode || undefined,
        }),
      });
      const raw = await res.text();
      const data = raw ? (() => {
        try { return JSON.parse(raw); } catch { return { message: raw }; }
      })() : {};
      if (!res.ok) {
        toast({
          title: "Signup failed",
          description: (data as any).message ?? (data as any).error ?? "Could not create account",
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
      const bonus = (data as any).referralBonus;
      const serverMessage = typeof (data as any).message === "string" ? (data as any).message : null;
      toast({
        title: "Account created!",
        description:
          bonus && Number(bonus) > 0
            ? `Welcome to SecurePool! You received a ${bonus} USDT welcome bonus!`
            : serverMessage ?? "You're signed in.",
      });
      navigate(nextPath);
    } catch (err: any) {
      toast({
        title: "Signup failed",
        description: err?.message || "Network error",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  const hasRefCode = referralCode.length > 0;

  const inputBase: React.CSSProperties = {
    background: "hsl(224,30%,13%)",
    border: "1px solid hsl(217,28%,20%)",
    color: "hsl(210,40%,98%)",
  };

  function walletInputStyle(phase: ReturnType<typeof trc20ValidationMessage>): React.CSSProperties {
    const b: React.CSSProperties = { ...inputBase };
    if (phase === "valid") {
      b.borderColor = "hsl(152,72%,44%)";
      b.boxShadow = "0 0 0 1px hsla(152,72%,44%,0.35)";
    } else if (phase === "invalid" || phase === "erc20_hint") {
      b.borderColor = "hsl(0,65%,45%)";
      b.boxShadow = "0 0 0 1px hsla(0,65%,45%,0.25)";
    }
    return b;
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-5 py-8 bg-[#0a1628]">
      <div className="w-full max-w-[460px] rounded-[20px] border px-8 py-10 login-card-fade"
        style={{ background: "#0d1b2a", borderColor: "rgba(255,255,255,0.06)" }}>
        <div className="text-center mb-7">
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
          <p className="text-[13px] mt-2 text-[#64748b]">Create your account and start with USDT rewards</p>
        </div>

        {hasRefCode && (
          <div className="rounded-xl px-4 py-3 mb-4 text-xs"
            style={{ background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.25)", color: "#10b981" }}>
            Referral code applied: <span className="font-mono">{referralCode}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          <input id="name" type="text" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)}
            placeholder="Full name" required minLength={2}
            className="w-full min-h-12 rounded-xl px-4 text-sm outline-none"
            style={{ ...inputBase, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }} />

          <input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="Email address" required
            className="w-full min-h-12 rounded-xl px-4 text-sm outline-none"
            style={{ ...inputBase, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }} />

          <input id="cryptoAddress" type="text" autoComplete="off" spellCheck={false} value={cryptoAddress}
            onChange={(e) => setCryptoAddress(e.target.value)} placeholder="TRC20 wallet (optional)" maxLength={64}
            className="w-full min-h-12 rounded-xl px-4 text-sm outline-none font-mono"
            style={walletInputStyle(addrPhase)} />

          <input id="cryptoAddressConfirm" type="text" autoComplete="off" spellCheck={false} value={cryptoAddressConfirm}
            onChange={(e) => setCryptoAddressConfirm(e.target.value)} placeholder="Confirm TRC20 wallet (optional)" maxLength={64}
            className="w-full min-h-12 rounded-xl px-4 text-sm outline-none font-mono"
            style={walletInputStyle(
              cryptoAddressConfirm.trim() === ""
                ? "empty"
                : trc20ValidationMessage(cryptoAddressConfirm) === "erc20_hint"
                  ? "erc20_hint"
                  : !TRC20_ADDRESS_REGEX.test(cryptoAddressConfirm.trim())
                    ? "invalid"
                    : addressesMatch
                      ? "valid"
                      : "invalid"
            )} />

          <div className="relative">
            <input id="password" type={showPassword ? "text" : "password"} autoComplete="new-password"
              value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password (min 6 chars)"
              required minLength={6}
              className="w-full min-h-12 rounded-xl px-4 pr-12 text-sm outline-none"
              style={{ ...inputBase, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }} />
            <button type="button" onClick={() => setShowPassword((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[#64748b]"
              aria-label={showPassword ? "Hide password" : "Show password"}>
              {showPassword ? "🙈" : "👁"}
            </button>
          </div>
          <PasswordStrength password={password} />

          <input id="ref" type="text" autoComplete="off" value={referralCode}
            onChange={(e) => setReferralCode(e.target.value.toUpperCase())} placeholder="Referral code (optional)"
            className="w-full min-h-12 rounded-xl px-4 text-sm outline-none font-mono tracking-wider"
            style={{ ...inputBase, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }} />

          <button type="submit" disabled={loading || !canSubmit}
            className="w-full h-12 rounded-xl font-semibold text-white disabled:opacity-60 disabled:cursor-not-allowed mt-2"
            style={{ background: loading ? "#0d9668" : "#10b981" }}>
            {loading ? "Creating account..." : "Create Account"}
          </button>
        </form>

        <div className="login-divider"><span>or</span></div>
        <Link href="/login">
          <button className="w-full h-11 rounded-xl text-sm font-semibold border border-[#10b981] text-[#10b981] hover:bg-[rgba(16,185,129,0.08)] mt-2">
            Login
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
