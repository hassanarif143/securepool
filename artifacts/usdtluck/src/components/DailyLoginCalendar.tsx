import { useState } from "react";
import { Button } from "@/components/ui/button";
import { apiUrl, readApiErrorMessage } from "@/lib/api-base";
import { getCsrfToken, setCsrfToken } from "@/lib/csrf";

type DailyLoginResponse = {
  isNewLogin: boolean;
  dayNumber: number;
  reward: { type: string; value: number };
  nextReward: { day: number; type: string; value: number };
  streakBroken: boolean;
  claimed: boolean;
  loginRowId?: number;
};

const DAYS = [1, 2, 3, 4, 5, 6, 7];

export function DailyLoginCalendar({
  initial,
  onClaimed,
  onDismiss,
}: {
  initial: DailyLoginResponse;
  onClaimed: () => void;
  onDismiss: () => void;
}) {
  const [claimed, setClaimed] = useState(initial.claimed);
  const [busy, setBusy] = useState(false);

  async function claim() {
    if (!initial.loginRowId || claimed) return;
    setBusy(true);
    try {
      const csrfRes = await fetch(apiUrl("/api/auth/csrf-token"), { credentials: "include" });
      const csrfData = await csrfRes.json().catch(() => ({}));
      const token = (csrfData as { csrfToken?: string }).csrfToken ?? getCsrfToken();
      setCsrfToken(token ?? null);
      const res = await fetch(apiUrl("/api/user/daily-login/claim"), {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { "x-csrf-token": token } : {}),
        },
        body: JSON.stringify({ loginRowId: initial.loginRowId }),
      });
      if (!res.ok) {
        alert(await readApiErrorMessage(res));
        return;
      }
      setClaimed(true);
      onClaimed();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/80" onClick={onDismiss}>
      <div
        className="w-full max-w-lg rounded-2xl border border-primary/30 bg-card p-5 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold text-center mb-1">Daily check-in</h2>
        {initial.streakBroken && (
          <p className="text-sm text-center text-amber-200/90 mb-2">
            You missed a day — streak reset. Claim today to start fresh!
          </p>
        )}
        <p className="text-xs text-muted-foreground text-center mb-4">
          Day {initial.dayNumber} reward · Next: day {initial.nextReward.day}
        </p>
        <div className="flex gap-1.5 sm:gap-2 justify-between mb-6 overflow-x-auto pb-1">
          {DAYS.map((d) => {
            const isCurrent = d === initial.dayNumber;
            const isPast = d < initial.dayNumber;
            const isSeven = d === 7;
            return (
              <div
                key={d}
                className={`flex-shrink-0 flex flex-col items-center justify-center rounded-xl border p-2 min-w-[52px] sm:min-w-[56px] ${
                  isSeven ? "min-h-[88px] border-yellow-500/50 bg-yellow-500/10" : "min-h-[72px]"
                } ${isCurrent ? "ring-2 ring-primary ring-offset-2 ring-offset-background animate-pulse" : ""} ${
                  isPast ? "bg-green-500/15 border-green-500/30" : "bg-muted/30 border-border"
                }`}
              >
                <span className="text-[10px] text-muted-foreground">D{d}</span>
                <span className="text-xs font-semibold mt-1">{`${d <= 3 ? d : d - 1} pts`}</span>
                {isPast && <span className="text-[10px] mt-0.5">✓</span>}
                {!isPast && !isCurrent && <span className="text-[10px] mt-0.5 opacity-50">🔒</span>}
              </div>
            );
          })}
        </div>
        <div className="text-center space-y-3">
          <p className="text-sm">
            Today:{" "}
            <span className="font-semibold text-primary">
              {initial.reward.value} reward points
            </span>
          </p>
          {!claimed ? (
            <Button className="w-full" disabled={busy} onClick={() => void claim()}>
              {busy ? "Claiming…" : "Claim"}
            </Button>
          ) : (
            <p className="text-sm text-green-400">Claimed — see you tomorrow!</p>
          )}
          <button type="button" className="text-xs text-muted-foreground underline" onClick={onDismiss}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
