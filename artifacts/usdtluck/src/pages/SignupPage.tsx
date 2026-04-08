import { useState, useEffect, useMemo } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { useAuth } from "@/context/AuthContext";
import { useQueryClient } from "@tanstack/react-query";
import { getGetMeQueryKey, getMe } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { Logo } from "@/components/Logo";
import { getCsrfToken, setCsrfToken } from "@/lib/csrf";
import { apiUrl } from "@/lib/api-base";
import { setSessionAccessToken } from "@/lib/auth-token";
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
      const bearer = typeof (data as any).token === "string" ? (data as any).token : null;
      if (bearer) {
        setSessionAccessToken(bearer);
        try {
          await queryClient.fetchQuery({
            queryKey: getGetMeQueryKey(),
            queryFn: ({ signal }) => getMe({ signal }),
          });
        } catch {
          toast({
            title: "Could not sync session",
            description: "Try refreshing the page. If this persists, redeploy API + frontend from latest main.",
            variant: "destructive",
          });
        }
      } else {
        toast({
          title: "Auth token missing from server",
          description: "Redeploy Railway API from latest GitHub main, then sign up again.",
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

  function onFocus(e: React.FocusEvent<HTMLInputElement>) {
    e.target.style.borderColor = "hsla(152,72%,44%,0.5)";
    e.target.style.boxShadow = "0 0 0 3px hsla(152,72%,44%,0.08)";
  }
  function onBlur(e: React.FocusEvent<HTMLInputElement>) {
    e.target.style.borderColor = hasRefCode && e.target.id === "ref"
      ? "hsla(152,72%,44%,0.4)"
      : "hsl(217,28%,20%)";
    e.target.style.boxShadow = "none";
  }

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
    <div className="min-h-[calc(100vh-8rem)] flex items-center justify-center -mx-4 sm:-mx-6 lg:-mx-8 -my-8 px-4">
      {/* Glow orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/3 right-1/4 w-96 h-96 rounded-full opacity-[0.06] blur-3xl"
          style={{ background: "radial-gradient(circle, #16a34a, transparent)" }} />
        <div className="absolute bottom-1/3 left-1/4 w-80 h-80 rounded-full opacity-[0.04] blur-3xl"
          style={{ background: "radial-gradient(circle, #a855f7, transparent)" }} />
      </div>

      <div className="relative z-10 w-full max-w-4xl">
        <div className="grid md:grid-cols-2 gap-0 rounded-2xl overflow-hidden shadow-2xl"
          style={{ boxShadow: "0 25px 60px rgba(0,0,0,0.6), 0 0 0 1px hsl(217,28%,18%)" }}>

          {/* ── Left panel — perks ── */}
          <div className="hidden md:flex flex-col justify-between p-10 relative overflow-hidden"
            style={{ background: "linear-gradient(145deg, hsl(224,35%,9%), hsl(222,32%,12%))" }}>
            {/* Grid overlay */}
            <div className="absolute inset-0 opacity-[0.04]"
              style={{
                backgroundImage: "repeating-linear-gradient(0deg,transparent,transparent 40px,white 40px,white 41px),repeating-linear-gradient(90deg,transparent,transparent 40px,white 40px,white 41px)"
              }} />
            <div className="absolute top-0 left-0 right-0 h-px"
              style={{ background: "linear-gradient(90deg,transparent,hsla(152,72%,44%,0.5),transparent)" }} />

            {/* Logo */}
            <div>
              <Link href="/">
                <div className="cursor-pointer">
                  <Logo size="lg" />
                </div>
              </Link>
              <p className="text-muted-foreground text-sm mt-3 leading-relaxed max-w-xs">
                Create your free account and start competing for real USDT rewards today.
              </p>
            </div>

            {/* What you get */}
            <div className="space-y-3 my-8">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-4">
                What you get
              </p>
              {[
                { icon: "🎁", title: "First deposit perk", desc: "Get welcome reward points after your first approved deposit (for pool entries)" },
                { icon: "🎱", title: "Access to all pools", desc: "Join any open pool — 10 USDT entry, up to 100 USDT prize" },
                { icon: "🎱", title: "Start joining pools", desc: "Access open pools right after signup and wallet funding" },
                { icon: "💰", title: "Withdraw anytime", desc: "Your wallet balance is always yours to withdraw" },
                { icon: "🔗", title: "Your own referral link", desc: "Share and earn bonuses every time someone joins" },
              ].map((f) => (
                <div key={f.title} className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-sm"
                    style={{ background: "hsla(152,72%,44%,0.1)", border: "1px solid hsla(152,72%,44%,0.15)" }}>
                    {f.icon}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{f.title}</p>
                    <p className="text-xs text-muted-foreground">{f.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Social proof */}
            <div className="rounded-xl p-4"
              style={{ background: "hsla(152,72%,44%,0.06)", border: "1px solid hsla(152,72%,44%,0.12)" }}>
              <div className="flex items-center gap-2 mb-1.5">
                <div className="flex -space-x-1.5">
                  {["A","P","M"].map((l) => (
                    <div key={l} className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold border-2"
                      style={{ background: "hsla(152,72%,44%,0.2)", borderColor: "hsl(222,32%,12%)", color: "hsl(152,72%,60%)" }}>
                      {l}
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">Ahmed, Priya, Mohammed + more</p>
              </div>
              <p className="text-xs text-foreground font-medium">"Won 100 USDT on my third pool!"</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">Real winners, real payouts — verified on-chain</p>
            </div>
          </div>

          {/* ── Right panel — form ── */}
          <div className="flex flex-col justify-center p-8 md:p-10"
            style={{ background: "hsl(222,30%,10%)" }}>
            {/* Mobile logo */}
            <div className="flex md:hidden mb-8">
              <Logo size="md" />
            </div>

            <div className="mb-6">
              <h1 className="text-2xl font-bold tracking-tight">Create your account</h1>
              <p className="text-muted-foreground text-sm mt-1">Free to join — no hidden fees</p>
            </div>

            {/* Referral banner */}
            {hasRefCode && (
              <div className="rounded-xl px-4 py-3 mb-5 flex items-start gap-2.5"
                style={{ background: "hsla(152,72%,44%,0.08)", border: "1px solid hsla(152,72%,44%,0.25)" }}>
                <span className="text-lg mt-0.5">🎁</span>
                <div>
                  <p className="text-sm font-semibold" style={{ color: "hsl(152,72%,55%)" }}>
                    Referral code applied: <span className="font-mono">{referralCode}</span>
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Your referrer earns 2 USDT (withdrawable) when you join your first pool — not on signup alone.
                  </p>
                </div>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Full name */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium" htmlFor="name">Full name</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                    <svg className="w-4 h-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </div>
                  <input id="name" type="text" autoComplete="name"
                    value={name} onChange={(e) => setName(e.target.value)}
                    placeholder="Your full name" required minLength={2}
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl text-sm outline-none transition-all"
                    style={inputBase} onFocus={onFocus} onBlur={onBlur} />
                </div>
              </div>

              {/* Email */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium" htmlFor="email">Email address</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                    <svg className="w-4 h-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207" />
                    </svg>
                  </div>
                  <input id="email" type="email" autoComplete="email"
                    value={email} onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com" required
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl text-sm outline-none transition-all"
                    style={inputBase} onFocus={onFocus} onBlur={onBlur} />
                </div>
              </div>

              {/* TRC20 wallet — optional at signup */}
              <div className="rounded-xl px-3 py-2.5 mb-1"
                style={{ background: "hsla(38,92%,50%,0.08)", border: "1px solid hsla(38,92%,50%,0.25)" }}>
                <p className="text-xs leading-relaxed" style={{ color: "hsl(38,90%,62%)" }}>
                  Wallet address optional hai. Aap signup bina wallet ke kar sakte hain, lekin deposit/withdraw se pehle profile me add karna zaroori hoga.
                </p>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium" htmlFor="cryptoAddress">
                  Your TRC20 Wallet Address <span className="text-muted-foreground">(optional)</span>
                </label>
                <input
                  id="cryptoAddress"
                  type="text"
                  autoComplete="off"
                  spellCheck={false}
                  value={cryptoAddress}
                  onChange={(e) => setCryptoAddress(e.target.value)}
                  placeholder="T..."
                  maxLength={64}
                  className="w-full px-4 py-2.5 rounded-xl text-sm outline-none transition-all font-mono"
                  style={walletInputStyle(addrPhase)}
                  onFocus={onFocus}
                  onBlur={onBlur}
                />
                <p className="text-[11px] text-muted-foreground">
                  Your TRON wallet address starts with &apos;T&apos; and is 34 characters long.
                </p>
                {addrPhase === "erc20_hint" && (
                  <p className="text-xs" style={{ color: "hsl(0,72%,55%)" }}>
                    This looks like an ERC20 (Ethereum) address. Please enter a TRC20 (TRON) address starting with &apos;T&apos;.
                  </p>
                )}
                {cryptoAddress.trim() && addrPhase === "invalid" && (
                  <p className="text-xs flex items-center gap-1" style={{ color: "hsl(0,72%,55%)" }}>
                    <span aria-hidden>✕</span> Invalid TRC20 address format
                  </p>
                )}
                {addrPhase === "valid" && (
                  <p className="text-xs flex items-center gap-1" style={{ color: "hsl(152,72%,55%)" }}>
                    <span aria-hidden>✓</span> Valid TRC20 address
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium" htmlFor="cryptoAddressConfirm">
                  Confirm your TRC20 Wallet Address <span className="text-muted-foreground">(if entered)</span>
                </label>
                <input
                  id="cryptoAddressConfirm"
                  type="text"
                  autoComplete="off"
                  spellCheck={false}
                  value={cryptoAddressConfirm}
                  onChange={(e) => setCryptoAddressConfirm(e.target.value)}
                  placeholder="T..."
                  maxLength={64}
                  className="w-full px-4 py-2.5 rounded-xl text-sm outline-none transition-all font-mono"
                  style={walletInputStyle(
                    cryptoAddressConfirm.trim() === ""
                      ? "empty"
                      : trc20ValidationMessage(cryptoAddressConfirm) === "erc20_hint"
                        ? "erc20_hint"
                        : !TRC20_ADDRESS_REGEX.test(cryptoAddressConfirm.trim())
                          ? "invalid"
                          : addressesMatch
                            ? "valid"
                            : "invalid",
                  )}
                  onFocus={onFocus}
                  onBlur={onBlur}
                />
                {cryptoAddressConfirm.trim() &&
                  TRC20_ADDRESS_REGEX.test(cryptoAddressConfirm.trim()) &&
                  !addressesMatch && (
                  <p className="text-xs" style={{ color: "hsl(0,72%,55%)" }}>Wallet addresses do not match</p>
                )}
                {cryptoAddressConfirm.trim() &&
                  addressesMatch &&
                  TRC20_ADDRESS_REGEX.test(cryptoAddress.trim()) && (
                  <p className="text-xs flex items-center gap-1" style={{ color: "hsl(152,72%,55%)" }}>
                    <span aria-hidden>✓</span> Addresses match
                  </p>
                )}
              </div>

              {/* Password */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium" htmlFor="password">Password</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                    <svg className="w-4 h-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  </div>
                  <input id="password" type={showPassword ? "text" : "password"} autoComplete="new-password"
                    value={password} onChange={(e) => setPassword(e.target.value)}
                    placeholder="Min 6 characters" required minLength={6}
                    className="w-full pl-10 pr-11 py-2.5 rounded-xl text-sm outline-none transition-all"
                    style={inputBase} onFocus={onFocus} onBlur={onBlur} />
                  <button type="button" onClick={() => setShowPassword((v) => !v)}
                    className="absolute inset-y-0 right-3 flex items-center text-muted-foreground hover:text-foreground transition-colors">
                    {showPassword ? (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    )}
                  </button>
                </div>
                <PasswordStrength password={password} />
              </div>

              {/* Referral code */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium" htmlFor="ref">
                  Referral code
                  <span className="text-muted-foreground font-normal ml-1.5">(optional)</span>
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                    <svg className="w-4 h-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                    </svg>
                  </div>
                  <input id="ref" type="text" autoComplete="off"
                    value={referralCode} onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
                    placeholder="e.g. AB3XYZ89"
                    className="w-full pl-10 pr-10 py-2.5 rounded-xl text-sm outline-none transition-all font-mono tracking-wider"
                    style={{
                      ...inputBase,
                      ...(hasRefCode ? { borderColor: "hsla(152,72%,44%,0.4)" } : {}),
                    }}
                    onFocus={onFocus} onBlur={onBlur} />
                  {hasRefCode && (
                    <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
                        style={{ color: "hsl(152,72%,55%)" }}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  )}
                </div>
                {hasRefCode && (
                  <p className="text-xs" style={{ color: "hsl(152,72%,55%)" }}>
                    ✓ Referral linked — rewards apply after email verification and first pool entry
                  </p>
                )}
              </div>

              {/* Submit */}
              <button type="submit" disabled={loading || !canSubmit}
                className="w-full py-2.5 rounded-xl font-semibold text-sm text-white transition-all mt-1 disabled:opacity-60 disabled:cursor-not-allowed"
                style={{
                  background: loading ? "hsl(152,50%,35%)" : "linear-gradient(135deg,#16a34a,#15803d)",
                  boxShadow: loading ? "none" : "0 4px 16px rgba(22,163,74,0.35)",
                }}>
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Creating account…
                  </span>
                ) : "Create Account — It's Free"}
              </button>
            </form>

            {/* Sign in link */}
            <p className="text-center text-sm text-muted-foreground mt-5">
              Already have an account?{" "}
              <Link href="/login" className="font-medium hover:underline" style={{ color: "hsl(152,72%,55%)" }}>
                Sign in
              </Link>
            </p>

            {/* Trust badges */}
            <div className="flex items-center justify-center gap-4 mt-5">
              {[
                { icon: "🔒", label: "SSL Secured" },
                { icon: "🆓", label: "Always Free" },
                { icon: "⚡", label: "Instant Setup" },
              ].map((b) => (
                <div key={b.label} className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <span>{b.icon}</span>
                  <span>{b.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
