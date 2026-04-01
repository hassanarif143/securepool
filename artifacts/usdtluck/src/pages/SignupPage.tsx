import { useState, useEffect } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Logo } from "@/components/Logo";

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
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [referralCode, setReferralCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [, navigate] = useLocation();
  const search = useSearch();
  const { setUser } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    const params = new URLSearchParams(search);
    const ref = params.get("ref");
    if (ref) setReferralCode(ref.toUpperCase());
  }, [search]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password, referralCode: referralCode || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: "Signup failed", description: data.message ?? data.error ?? "Could not create account", variant: "destructive" });
        return;
      }
      setUser(data.user as any);
      const bonus = data.referralBonus;
      toast({
        title: "Account created!",
        description: bonus
          ? `Welcome to SecurePool! You received a ${bonus} USDT welcome bonus!`
          : "Welcome to SecurePool.",
      });
      navigate("/dashboard");
    } catch {
      toast({ title: "Signup failed", description: "Network error", variant: "destructive" });
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
                { icon: "🎁", title: "Free welcome bonus", desc: "Instant USDT bonus when you join with a referral" },
                { icon: "🎱", title: "Access to all pools", desc: "Join any open pool — 10 USDT entry, up to 100 USDT prize" },
                { icon: "🥉", title: "Bronze tier instantly", desc: "Start earning tier points from your very first pool" },
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
                  <p className="text-xs text-muted-foreground mt-0.5">+1 USDT welcome bonus will be added to your wallet on signup</p>
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
                  <p className="text-xs" style={{ color: "hsl(152,72%,55%)" }}>✓ +1 USDT welcome bonus will be added to your wallet</p>
                )}
              </div>

              {/* Submit */}
              <button type="submit" disabled={loading}
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
