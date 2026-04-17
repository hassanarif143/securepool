import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { apiUrl } from "@/lib/api-base";
import { UsdtAmount } from "@/components/UsdtAmount";

type VerifyResponse = {
  poolId: number;
  poolName: string;
  totalTickets: number;
  drawDate: string | null;
  serverSeed: string | null;
  seedHash: string | null;
  winnerIndex: number | null;
  winnerMasked: string | null;
  amountWon: number | null;
  participants: string[];
  algorithm: string;
  note?: string;
};

async function sha256Hex(input: string): Promise<string> {
  const enc = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export default function ProvablyFairPage() {
  const [location] = useLocation();
  const initialPoolId = useMemo(() => {
    const q = location.split("?")[1] ?? "";
    const params = new URLSearchParams(q);
    const p = params.get("pool") ?? params.get("poolId");
    return p ?? "";
  }, [location]);
  const [poolIdInput, setPoolIdInput] = useState(initialPoolId);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<VerifyResponse | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [isVerified, setIsVerified] = useState<boolean | null>(null);

  useEffect(() => {
    if (initialPoolId && !result && !loading) {
      void verify(initialPoolId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPoolId]);

  useEffect(() => {
    let cancelled = false;
    if (!result?.serverSeed || !result?.seedHash) {
      setIsVerified(null);
      return;
    }
    void sha256Hex(result.serverSeed).then((h) => {
      if (!cancelled) setIsVerified(h === result.seedHash);
    });
    return () => {
      cancelled = true;
    };
  }, [result]);

  async function verify(input: string) {
    const id = parseInt(input, 10);
    if (isNaN(id) || id <= 0) {
      setErrorText("Enter a valid pool ID.");
      return;
    }
    setLoading(true);
    setErrorText(null);
    try {
      const res = await fetch(apiUrl(`/api/pools/${id}/verify`), { credentials: "include" });
      if (!res.ok) {
        setResult(null);
        setErrorText("Could not verify this draw. Please check the pool ID.");
        return;
      }
      const data = (await res.json()) as VerifyResponse;
      setResult(data);
    } catch {
      setResult(null);
      setErrorText("Verification failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="wrap space-y-10">
      <section className="text-center space-y-3 pt-2">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary/90">Provably Fair</p>
        <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight">Public draw verification</h1>
        <p className="text-muted-foreground max-w-2xl mx-auto">
          Every completed draw can be checked using its seed commitment, winner position, and participant list.
        </p>
      </section>

      <section className="rounded-2xl border border-[hsl(217,28%,18%)] bg-[hsl(222,30%,9%)] p-5 sm:p-6">
        <h2 className="text-xl font-bold mb-4">How Our Draws Work</h2>
        <div className="grid gap-3 sm:grid-cols-5">
          {[
            { title: "Pool Fills", desc: "Users buy tickets until draw can run." },
            { title: "Seed Generated", desc: "Server generates a random draw seed." },
            { title: "Hash Published", desc: "SHA-256 hash is committed for verification." },
            { title: "Winner Selected", desc: "CSPRNG-based draw settles winners." },
            { title: "Results Published", desc: "Winner, seed, hash, and participants are visible." },
          ].map((step, idx) => (
            <div key={step.title} className="relative rounded-xl border border-border/70 bg-card/40 p-3">
              <p className="text-[10px] uppercase tracking-[0.18em] text-primary/80 mb-1">Step {idx + 1}</p>
              <p className="text-sm font-semibold">{step.title}</p>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{step.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-[hsl(217,28%,18%)] bg-[hsl(222,30%,9%)] p-5 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            value={poolIdInput}
            onChange={(e) => setPoolIdInput(e.target.value)}
            placeholder="Enter Pool ID"
            className="flex-1 h-10 rounded-lg border border-border/70 bg-background/60 px-3 text-sm outline-none focus:border-primary/60"
          />
          <Button onClick={() => void verify(poolIdInput)} disabled={loading}>
            {loading ? "Verifying..." : "Verify Draw"}
          </Button>
        </div>
        {errorText && <p className="text-sm text-red-400">{errorText}</p>}

        {result && (
          <div className="rounded-xl border border-border/70 bg-black/20 p-4 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold">{result.poolName} (#{result.poolId})</p>
              {isVerified === true && (
                <span className="text-xs font-semibold rounded-full px-2 py-0.5 bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                  Verified
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">Total Tickets: {result.totalTickets}</p>
            <p className="text-xs text-muted-foreground">Draw Date: {result.drawDate ? new Date(result.drawDate).toLocaleString() : "N/A"}</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="rounded-lg border border-border/60 bg-background/50 p-3">
                <p className="text-[11px] uppercase tracking-[0.15em] text-muted-foreground mb-1">Server Seed</p>
                <p className="text-xs font-mono break-all">{result.serverSeed ?? "N/A"}</p>
              </div>
              <div className="rounded-lg border border-border/60 bg-background/50 p-3">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <p className="text-[11px] uppercase tracking-[0.15em] text-muted-foreground">Seed Hash</p>
                  {result.seedHash && (
                    <button
                      type="button"
                      onClick={() => void navigator.clipboard.writeText(result.seedHash!)}
                      className="text-[11px] text-primary hover:underline"
                    >
                      Copy
                    </button>
                  )}
                </div>
                <p className="text-xs font-mono break-all">{result.seedHash ?? "N/A"}</p>
              </div>
            </div>
            <div className="text-sm">
              <p>
                Winner: <span className="font-semibold">{result.winnerMasked ?? "N/A"}</span>
                {result.amountWon != null ? (
                  <span className="text-[#D4A843] font-semibold inline-flex ml-1">
                    (
                    <UsdtAmount
                      amount={result.amountWon}
                      prefix="+"
                      amountClassName="text-[#D4A843] font-semibold"
                      currencyClassName="text-[10px] text-[#64748b]"
                    />
                    )
                  </span>
                ) : null}
              </p>
              <p className="text-muted-foreground text-xs mt-1">Winner Index: {result.winnerIndex ?? "N/A"}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-[0.15em] text-muted-foreground mb-1">Participants (masked)</p>
              <p className="text-xs text-foreground/90 leading-relaxed">{result.participants.join(", ") || "N/A"}</p>
            </div>
            <p className="text-xs text-muted-foreground">Algorithm: {result.algorithm}</p>
            {result.note ? <p className="text-xs text-amber-300">{result.note}</p> : null}
          </div>
        )}
      </section>

      <section className="grid sm:grid-cols-3 gap-3">
        {[
          {
            title: "Cryptographic Randomness",
            body: "Draw logic uses cryptographically secure random functions, not predictable pseudo-random UI values.",
          },
          {
            title: "Pre-committed Hash",
            body: "Seed hash is stored alongside the draw, so the revealed seed can be independently checked after completion.",
          },
          {
            title: "Open Verification",
            body: "Anyone can query a pool and verify winner details, participants, and seed/hash consistency.",
          },
        ].map((card) => (
          <div key={card.title} className="rounded-xl border border-border/70 bg-card/40 p-4">
            <h3 className="font-semibold text-sm">{card.title}</h3>
            <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">{card.body}</p>
          </div>
        ))}
      </section>

      <div className="text-center">
        <Button asChild variant="outline">
          <Link href="/how-it-works">Back to How It Works</Link>
        </Button>
      </div>
    </div>
  );
}
