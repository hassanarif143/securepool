import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useLogin } from "@workspace/api-client-react";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Logo } from "@/components/Logo";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [, navigate] = useLocation();
  const { setUser } = useAuth();
  const loginMutation = useLogin();
  const { toast } = useToast();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    loginMutation.mutate(
      { data: { email, password } },
      {
        onSuccess: (data) => {
          setUser(data.user as any);
          toast({ title: "Welcome back!", description: `Logged in as ${data.user.name}` });
          navigate("/dashboard");
        },
        onError: (err: any) => {
          toast({
            title: "Login failed",
            description: err?.message ?? "Invalid email or password",
            variant: "destructive",
          });
        },
      }
    );
  }

  function fillDemo(type: "admin" | "user") {
    if (type === "admin") {
      setEmail("admin@usdtluck.com");
      setPassword("password123");
    } else {
      setEmail("ahmed@example.com");
      setPassword("password123");
    }
  }

  return (
    <div className="min-h-[calc(100vh-8rem)] flex items-center justify-center -mx-4 sm:-mx-6 lg:-mx-8 -my-8 px-4">
      {/* Background glow orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full opacity-[0.06] blur-3xl"
          style={{ background: "radial-gradient(circle, #16a34a, transparent)" }} />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 rounded-full opacity-[0.05] blur-3xl"
          style={{ background: "radial-gradient(circle, #3b82f6, transparent)" }} />
      </div>

      <div className="relative z-10 w-full max-w-4xl">
        <div className="grid md:grid-cols-2 gap-0 rounded-2xl overflow-hidden shadow-2xl"
          style={{ boxShadow: "0 25px 60px rgba(0,0,0,0.6), 0 0 0 1px hsl(217,28%,18%)" }}>

          {/* ── Left panel — branding ── */}
          <div className="hidden md:flex flex-col justify-between p-10 relative overflow-hidden"
            style={{ background: "linear-gradient(145deg, hsl(224,35%,9%), hsl(222,32%,12%))" }}>
            {/* Decorative lines */}
            <div className="absolute inset-0 opacity-[0.04]"
              style={{
                backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 40px, white 40px, white 41px), repeating-linear-gradient(90deg, transparent, transparent 40px, white 40px, white 41px)"
              }} />
            <div className="absolute top-0 left-0 right-0 h-px"
              style={{ background: "linear-gradient(90deg, transparent, hsla(152,72%,44%,0.5), transparent)" }} />

            {/* Logo */}
            <div>
              <Link href="/">
                <div className="cursor-pointer">
                  <Logo size="lg" />
                </div>
              </Link>
              <p className="text-muted-foreground text-sm mt-3 leading-relaxed max-w-xs">
                Transparent USDT reward pools — join, win, withdraw instantly.
              </p>
            </div>

            {/* Feature list */}
            <div className="space-y-4 my-8">
              {[
                { icon: "🔒", title: "Secure & Transparent", desc: "Every pool result is verifiable on-chain" },
                { icon: "⚡", title: "Instant Withdrawals", desc: "Winners receive USDT directly to their wallet" },
                { icon: "🎖️", title: "Tier Rewards", desc: "Earn points and unlock exclusive benefits" },
                { icon: "🔗", title: "Referral Bonuses", desc: "Invite friends and earn on every pool they join" },
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

            {/* Stats strip */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { value: "180+", label: "USDT Paid" },
                { value: "1", label: "Pools Won" },
                { value: "100%", label: "On-time" },
              ].map((s) => (
                <div key={s.label} className="rounded-xl p-2.5 text-center"
                  style={{ background: "hsla(152,72%,44%,0.06)", border: "1px solid hsla(152,72%,44%,0.1)" }}>
                  <p className="font-bold text-sm" style={{ color: "hsl(152,72%,55%)" }}>{s.value}</p>
                  <p className="text-[10px] text-muted-foreground">{s.label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* ── Right panel — form ── */}
          <div className="flex flex-col justify-center p-8 md:p-10"
            style={{ background: "hsl(222,30%,10%)" }}>
            {/* Mobile logo */}
            <div className="flex md:hidden mb-8">
              <Logo size="md" />
            </div>

            <div className="mb-7">
              <h1 className="text-2xl font-bold tracking-tight">Welcome back</h1>
              <p className="text-muted-foreground text-sm mt-1">Sign in to your account to continue</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Email */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground" htmlFor="email">
                  Email address
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                    <svg className="w-4 h-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207" />
                    </svg>
                  </div>
                  <input
                    id="email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl text-sm outline-none transition-all"
                    style={{
                      background: "hsl(224,30%,13%)",
                      border: "1px solid hsl(217,28%,20%)",
                      color: "hsl(210,40%,98%)",
                    }}
                    onFocus={(e) => { e.target.style.borderColor = "hsla(152,72%,44%,0.5)"; e.target.style.boxShadow = "0 0 0 3px hsla(152,72%,44%,0.08)"; }}
                    onBlur={(e) => { e.target.style.borderColor = "hsl(217,28%,20%)"; e.target.style.boxShadow = "none"; }}
                  />
                </div>
              </div>

              {/* Password */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground" htmlFor="password">
                  Password
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                    <svg className="w-4 h-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  </div>
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    required
                    className="w-full pl-10 pr-11 py-2.5 rounded-xl text-sm outline-none transition-all"
                    style={{
                      background: "hsl(224,30%,13%)",
                      border: "1px solid hsl(217,28%,20%)",
                      color: "hsl(210,40%,98%)",
                    }}
                    onFocus={(e) => { e.target.style.borderColor = "hsla(152,72%,44%,0.5)"; e.target.style.boxShadow = "0 0 0 3px hsla(152,72%,44%,0.08)"; }}
                    onBlur={(e) => { e.target.style.borderColor = "hsl(217,28%,20%)"; e.target.style.boxShadow = "none"; }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute inset-y-0 right-3 flex items-center text-muted-foreground hover:text-foreground transition-colors"
                  >
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
              </div>

              {/* Sign in button */}
              <button
                type="submit"
                disabled={loginMutation.isPending}
                className="w-full py-2.5 rounded-xl font-semibold text-sm text-white transition-all mt-2 disabled:opacity-60 disabled:cursor-not-allowed"
                style={{
                  background: loginMutation.isPending
                    ? "hsl(152,50%,35%)"
                    : "linear-gradient(135deg, #16a34a, #15803d)",
                  boxShadow: loginMutation.isPending ? "none" : "0 4px 16px rgba(22,163,74,0.35)",
                }}
              >
                {loginMutation.isPending ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Signing in…
                  </span>
                ) : "Sign In"}
              </button>
            </form>

            {/* Signup link */}
            <p className="text-center text-sm text-muted-foreground mt-5">
              Don't have an account?{" "}
              <Link href="/signup" className="font-medium hover:underline" style={{ color: "hsl(152,72%,55%)" }}>
                Create one free
              </Link>
            </p>

            {/* Demo credentials */}
            <div className="mt-5 rounded-xl p-4 space-y-2"
              style={{ background: "hsl(224,30%,13%)", border: "1px solid hsl(217,28%,18%)" }}>
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                Try a demo account
              </p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => fillDemo("user")}
                  className="flex flex-col items-start px-3 py-2 rounded-lg text-left transition-colors hover:bg-white/5"
                  style={{ border: "1px solid hsl(217,28%,22%)" }}
                >
                  <span className="text-[11px] font-semibold text-foreground">👤 User</span>
                  <span className="text-[10px] text-muted-foreground">ahmed@example.com</span>
                </button>
                <button
                  type="button"
                  onClick={() => fillDemo("admin")}
                  className="flex flex-col items-start px-3 py-2 rounded-lg text-left transition-colors hover:bg-white/5"
                  style={{ border: "1px solid hsl(217,28%,22%)" }}
                >
                  <span className="text-[11px] font-semibold text-foreground">⚙️ Admin</span>
                  <span className="text-[10px] text-muted-foreground">admin@usdtluck.com</span>
                </button>
              </div>
              <p className="text-[10px] text-muted-foreground text-center pt-1">Password: <span className="font-mono">password123</span></p>
            </div>

            {/* Trust badges */}
            <div className="flex items-center justify-center gap-4 mt-5">
              {[
                { icon: "🔒", label: "SSL Secured" },
                { icon: "🛡️", label: "Safe & Private" },
                { icon: "⚡", label: "Instant Access" },
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
