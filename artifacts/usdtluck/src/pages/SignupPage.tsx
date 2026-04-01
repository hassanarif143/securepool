import { useState, useEffect } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

export default function SignupPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [referralCode, setReferralCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [, navigate] = useLocation();
  const search = useSearch();
  const { setUser } = useAuth();
  const { toast } = useToast();

  /* Pre-fill referral code from ?ref= query param */
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
        title: "Account created! 🎉",
        description: bonus
          ? `Welcome to USDTLuck! You received a ${bonus} USDT welcome bonus!`
          : "Welcome to USDTLuck.",
      });
      navigate("/dashboard");
    } catch {
      toast({ title: "Signup failed", description: "Network error", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  const hasRefCode = referralCode.length > 0;

  return (
    <div className="max-w-md mx-auto">
      <Card className={hasRefCode ? "border-primary/30" : ""}>
        <CardHeader className="text-center">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-4"
            style={{ background: "linear-gradient(135deg, #16a34a, #15803d)", boxShadow: "0 4px 16px rgba(22,163,74,0.3)" }}
          >
            <span className="text-white font-bold text-xl">U</span>
          </div>
          <CardTitle>Create your account</CardTitle>
          <CardDescription>Join USDTLuck and start winning rewards</CardDescription>
        </CardHeader>
        <CardContent>
          {hasRefCode && (
            <div
              className="rounded-xl px-4 py-3 mb-4 flex items-start gap-2 text-sm"
              style={{ background: "hsla(152,72%,44%,0.08)", border: "1px solid hsla(152,72%,44%,0.25)" }}
            >
              <span className="mt-0.5">🎁</span>
              <div>
                <span className="text-primary font-medium">Referral code applied: </span>
                <span className="font-mono font-bold">{referralCode}</span>
                <p className="text-xs text-muted-foreground mt-0.5">You'll receive 1 USDT welcome bonus on signup!</p>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="name">Full name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your full name"
                required
                minLength={2}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email address</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Min 6 characters"
                required
                minLength={6}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ref">
                Referral code{" "}
                <span className="text-muted-foreground font-normal">(optional)</span>
              </Label>
              <Input
                id="ref"
                value={referralCode}
                onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
                placeholder="e.g. AB3XYZ89"
                className={hasRefCode ? "border-primary/40 focus-visible:ring-primary/30" : ""}
              />
              {hasRefCode && (
                <p className="text-xs text-primary">✓ +1 USDT welcome bonus will be added to your wallet</p>
              )}
            </div>
            <Button
              type="submit"
              className="w-full font-semibold"
              style={{ background: "linear-gradient(135deg, #16a34a, #15803d)", boxShadow: "0 4px 15px rgba(22,163,74,0.3)" }}
              disabled={loading}
            >
              {loading ? "Creating account..." : "Create Account"}
            </Button>
          </form>
          <p className="text-center text-sm text-muted-foreground mt-4">
            Already have an account?{" "}
            <Link href="/login" className="text-primary hover:underline font-medium">
              Sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
