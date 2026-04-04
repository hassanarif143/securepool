import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useCelebration } from "@/context/CelebrationContext";
import { apiUrl } from "@/lib/api-base";
import { getCsrfToken, setCsrfToken } from "@/lib/csrf";

type Props = {
  rewardId: number;
  rewardType: string;
  rewardValue: number;
  poolJoinNumber: number;
  onClose: () => void;
  onClaimed: () => void;
};

function labelFor(type: string, value: number) {
  if (type === "points_1") return `${value} referral point`;
  if (type === "points_3") return `${value} referral points`;
  if (type === "free_entry") return `${value} free pool ${value === 1 ? "entry" : "entries"}`;
  if (type === "badge") return "Lucky badge on your profile";
  return "Reward";
}

export function MysteryBoxReveal({ rewardId, rewardType, rewardValue, poolJoinNumber, onClose, onClaimed }: Props) {
  const { enqueue } = useCelebration();
  const [picked, setPicked] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [claiming, setClaiming] = useState(false);

  async function claim() {
    setClaiming(true);
    try {
      const csrfRes = await fetch(apiUrl("/api/auth/csrf-token"), { credentials: "include" });
      const csrfData = await csrfRes.json().catch(() => ({}));
      const token = (csrfData as { csrfToken?: string }).csrfToken ?? getCsrfToken();
      setCsrfToken(token ?? null);
      const res = await fetch(apiUrl(`/api/user/mystery/${rewardId}/claim`), {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { "x-csrf-token": token } : {}),
        },
      });
      if (!res.ok) throw new Error("Claim failed");
      enqueue({
        kind: "lucky",
        title: "⭐ Lucky reward!",
        message: `${labelFor(rewardType, rewardValue)} · Join #${poolJoinNumber}`,
        dedupeKey: `mystery-claim-${rewardId}`,
      });
      onClaimed();
      onClose();
    } catch {
      setClaiming(false);
    }
  }

  function pickBox(i: number) {
    if (picked != null) return;
    setPicked(i);
    setTimeout(() => setRevealed(true), 600);
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/75" onClick={onClose}>
      <div
        className="relative bg-card border border-primary/30 rounded-2xl p-6 max-w-md w-full shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-bold text-center mb-1">Mystery reward</h2>
        <p className="text-xs text-muted-foreground text-center mb-5">Every 3 pool joins — pick any box, same surprise inside ✨</p>
        <div className="grid grid-cols-3 gap-3 mb-6">
          {[0, 1, 2].map((i) => (
            <button
              key={i}
              type="button"
              disabled={picked != null}
              onClick={() => pickBox(i)}
              className={`aspect-[3/4] rounded-xl border-2 transition-all duration-500 flex items-center justify-center text-2xl ${
                picked === i && revealed
                  ? "border-primary scale-105 shadow-[0_0_20px_rgba(34,197,94,0.4)]"
                  : picked === i
                    ? "border-amber-500 animate-pulse"
                    : "border-muted hover:border-primary/50 bg-muted/30"
              }`}
            >
              {!revealed || picked !== i ? "🎁" : "✨"}
            </button>
          ))}
        </div>
        {revealed && (
          <div className="text-center space-y-3">
            <p className="text-lg font-semibold text-primary">{labelFor(rewardType, rewardValue)}</p>
            <p className="text-xs text-muted-foreground">Join #{poolJoinNumber}</p>
            <Button className="w-full" onClick={() => void claim()} disabled={claiming}>
              {claiming ? "Collecting…" : "Collect"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
