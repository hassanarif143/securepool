import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { SUPPORT_WHATSAPP_HREF } from "@/lib/support-links";

const PKR = 278;

export default function HowToBuyUsdtPage() {
  return (
    <div className="max-w-lg mx-auto px-4 py-10 space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">How to buy USDT in Pakistan</h1>
        <p className="text-sm text-muted-foreground mt-1">Step-by-step guide</p>
      </div>

      <section className="rounded-2xl border border-border/80 bg-card/30 p-5 space-y-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <span>⭐</span> Method 1: Binance P2P (recommended)
        </h2>
        <p className="text-xs text-muted-foreground">This is the easiest option and widely used in Pakistan.</p>
        <ol className="text-sm space-y-3 list-decimal pl-4 text-muted-foreground leading-relaxed">
          <li>
            Install the Binance app:{" "}
            <a href="https://apps.apple.com/app/binance/id1436799971" className="text-emerald-400 underline" target="_blank" rel="noopener noreferrer">
              App Store
            </a>{" "}
            /{" "}
            <a href="https://play.google.com/store/apps/details?id=com.binance.dev" className="text-emerald-400 underline" target="_blank" rel="noopener noreferrer">
              Google Play
            </a>
          </li>
          <li>Create an account and verify with CNIC (usually ~10 minutes).</li>
          <li>Home → <strong>P2P Trading</strong> → Buy → USDT → pay in PKR (JazzCash / Easypaisa / bank).</li>
          <li>Transfer PKR to the seller; USDT will arrive in your Binance wallet.</li>
        </ol>
        <p className="text-xs rounded-lg bg-muted/40 px-3 py-2 border border-border/60">
          Example rate: 1 USDT ≈ {PKR} PKR — the market rate can change.
        </p>
      </section>

      <section className="rounded-2xl border border-border/80 bg-card/30 p-5 space-y-2">
        <h2 className="text-lg font-semibold">Method 2: Local exchanger</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Shehar mein crypto OTC / exchangers bhi mil sakte hain. Always verify reputation — meet safe, start small.
        </p>
      </section>

      <div className="flex flex-col gap-2">
        <a href={SUPPORT_WHATSAPP_HREF} target="_blank" rel="noopener noreferrer" className="inline-flex justify-center rounded-xl border border-emerald-500/35 bg-emerald-950/25 px-4 py-3 text-sm text-emerald-200 font-medium">
          💬 WhatsApp — if you need help
        </a>
        <Button asChild variant="secondary" className="min-h-12">
          <Link href="/wallet?tab=deposit">Back to deposit</Link>
        </Button>
      </div>
    </div>
  );
}
