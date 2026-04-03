import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { apiUrl } from "@/lib/api-base";
import { Link } from "wouter";

export type ActiveCouponJson = {
  hasCoupon: boolean;
  discountPercent?: number;
  validUntil?: string;
  timeRemaining?: string;
  sourcePool?: string;
};

function useCountdown(validUntilIso: string | undefined) {
  const [label, setLabel] = useState("");
  useEffect(() => {
    if (!validUntilIso) return;
    const tick = () => {
      const ms = new Date(validUntilIso).getTime() - Date.now();
      if (ms <= 0) {
        setLabel("0:00");
        return;
      }
      const s = Math.floor(ms / 1000);
      const h = Math.floor(s / 3600);
      const m = Math.floor((s % 3600) / 60);
      const sec = s % 60;
      setLabel(h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [validUntilIso]);
  return label;
}

export function ComebackOfferModal({
  coupon,
  listEntryFee,
  onDismiss,
}: {
  coupon: ActiveCouponJson;
  listEntryFee: number;
  onDismiss: () => void;
}) {
  const pct = coupon.discountPercent ?? 10;
  const due = Math.round(listEntryFee * (1 - pct / 100) * 100) / 100;
  const save = Math.round((listEntryFee - due) * 100) / 100;
  const cd = useCountdown(coupon.validUntil);

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-4 bg-black/75" onClick={onDismiss}>
      <div
        className="w-full max-w-md rounded-2xl border border-primary/30 bg-card p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-bold text-center mb-2">Don&apos;t give up!</h2>
        <p className="text-sm text-muted-foreground text-center mb-4">
          You were close this time. Here&apos;s a {pct}% loyalty discount on your next pool entry.
        </p>
        <div className="rounded-xl bg-muted/40 p-4 text-center mb-4">
          <p className="text-sm text-muted-foreground mb-1">Your next entry</p>
          <p className="text-lg">
            <span className="line-through text-muted-foreground mr-2">{listEntryFee} USDT</span>
            <span className="text-primary font-bold">{due} USDT</span>
          </p>
          <p className="text-xs text-primary mt-1">Save {save} USDT</p>
        </div>
        <p className="text-center text-sm font-mono text-amber-200/90 mb-1">Offer expires in {cd || "—"}</p>
        <p className="text-center text-[11px] text-muted-foreground mb-4">This offer expires in 2 hours</p>
        <Button asChild className="w-full">
          <Link href="/pools">Join next pool at {pct}% off</Link>
        </Button>
        <button type="button" className="w-full mt-3 text-xs text-muted-foreground underline" onClick={onDismiss}>
          Dismiss
        </button>
      </div>
    </div>
  );
}

export function ComebackBanner({ coupon }: { coupon: ActiveCouponJson }) {
  const cd = useCountdown(coupon.validUntil);
  if (!coupon.hasCoupon) return null;
  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
      You have a {coupon.discountPercent ?? 10}% entry discount expiring in <span className="font-mono font-semibold">{cd}</span>
      —{" "}
      <Link href="/pools" className="underline text-primary">
        use it now
      </Link>
    </div>
  );
}
