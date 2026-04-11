import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";

const STEPS = [
  {
    title: "Open Binance → Wallets",
    body: "Bottom bar: tap Wallets. Then tap Spot and find USDT.",
  },
  {
    title: "Withdraw USDT",
    body: 'Tap Withdraw on USDT. Choose "Send via Crypto Network" (not internal transfer).',
  },
  {
    title: "Paste SecurePool address",
    body: "Paste the address we showed you. Double-check every character.",
  },
  {
    title: "Network = TRON (TRC20)",
    body: '⚠️ MUST select "TRON (TRC20)". Wrong network = permanent loss.',
  },
  {
    title: "Exact amount",
    body: "Type the exact USDT amount shown on SecurePool — not less, not more.",
  },
  {
    title: "Confirm & screenshot",
    body: "Complete 2FA. On the success screen, take a screenshot for SecurePool.",
  },
];

export function BinanceGuideModal({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] flex flex-col border-cyan-500/20">
        <DialogHeader>
          <DialogTitle>How to send USDT from Binance</DialogTitle>
          <DialogDescription className="text-left">
            Roman Urdu + English — har step follow karein. Screenshots Binance app mein thora vary ho sakte hain.
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-[60vh] pr-3">
          <ol className="space-y-4 text-sm text-muted-foreground">
            {STEPS.map((s, i) => (
              <li key={i} className="rounded-xl border border-border/80 bg-muted/20 p-3">
                <p className="font-semibold text-foreground">
                  {i + 1}. {s.title}
                </p>
                <p className="mt-1.5 leading-relaxed">{s.body}</p>
              </li>
            ))}
          </ol>
          <p className="mt-4 text-xs text-muted-foreground leading-relaxed">
            Trust Wallet / SafePal: same idea — Withdraw → TRC20 → paste address → exact amount.
          </p>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
