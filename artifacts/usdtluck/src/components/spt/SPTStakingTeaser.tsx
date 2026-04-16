import { useState } from "react";
import { apiUrl } from "@/lib/api-base";
import { Button } from "@/components/ui/button";

export function SPTStakingTeaser() {
  const [done, setDone] = useState(false);
  async function notify() {
    const csrfRes = await fetch(apiUrl("/api/auth/csrf-token"), { credentials: "include" });
    const csrfData = await csrfRes.json().catch(() => ({}));
    const token = (csrfData as { csrfToken?: string }).csrfToken;
    const res = await fetch(apiUrl("/api/spt/staking/waitlist"), {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", ...(token ? { "x-csrf-token": token } : {}) },
      body: "{}",
    });
    if (res.ok) setDone(true);
  }
  return (
    <div className="rounded-xl border border-violet-500/30 bg-violet-950/20 p-4 space-y-2">
      <p className="font-semibold text-violet-200">🔒 SPT staking — coming soon</p>
      <p className="text-xs text-muted-foreground leading-relaxed">
        Lock SPT for passive rewards. Expected APY 15–30%, min stake 1,000 SPT, lock 7 / 30 / 90 days.
      </p>
      <Button type="button" size="sm" variant="secondary" disabled={done} onClick={() => void notify()}>
        {done ? "You’re on the list" : "🔔 Notify me when live"}
      </Button>
    </div>
  );
}
