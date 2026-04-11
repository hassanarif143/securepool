import { useState } from "react";
import { Button } from "@/components/ui/button";
import { apiUrl, readApiErrorMessage } from "@/lib/api-base";
import { getCsrfToken, setCsrfToken } from "@/lib/csrf";
import { useToast } from "@/hooks/use-toast";

type P = { userId: number; displayName: string };

export function PredictionPicker({ poolId, onLocked }: { poolId: number; onLocked?: () => void }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [locked, setLocked] = useState(false);
  const [participants, setParticipants] = useState<P[]>([]);
  const [pick, setPick] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const r = await fetch(apiUrl(`/api/pools/${poolId}/predict/participants`), { credentials: "include" });
      const j = await r.json();
      if (!j.open) {
        setOpen(false);
        return;
      }
      setOpen(true);
      setLocked(Boolean(j.locked));
      setParticipants(Array.isArray(j.participants) ? j.participants : []);
    } catch {
      setOpen(false);
    } finally {
      setLoading(false);
    }
  }

  async function submit() {
    if (pick == null) return;
    const csrfRes = await fetch(apiUrl("/api/auth/csrf-token"), { credentials: "include" });
    const csrfData = await csrfRes.json().catch(() => ({}));
    const token = (csrfData as { csrfToken?: string }).csrfToken ?? getCsrfToken();
    setCsrfToken(token ?? null);
    const res = await fetch(apiUrl(`/api/pools/${poolId}/predict`), {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { "x-csrf-token": token } : {}),
      },
      body: JSON.stringify({ predictedUserId: pick }),
    });
    if (!res.ok) {
      toast({ title: "Could not save", description: await readApiErrorMessage(res), variant: "destructive" });
      return;
    }
    setLocked(true);
    onLocked?.();
    toast({ title: "Prediction saved", description: "Results after the fair draw." });
  }

  if (!open && !loading) {
    return (
      <Button variant="outline" size="sm" className="w-full" onClick={() => void load()}>
        Predict top finisher (75%+ fill)
      </Button>
    );
  }

  if (loading) return <p className="text-xs text-muted-foreground">Loading prediction…</p>;

  if (locked) {
    return (
      <p className="text-xs text-muted-foreground border border-border/60 rounded-lg p-3">
        Your pick is locked. Results appear after the draw — no cost, just for fun.
      </p>
    );
  }

  return (
    <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-4 space-y-3">
      <p className="text-sm font-medium">Predict who finishes first</p>
      <p className="text-[11px] text-muted-foreground">
        Optional engagement — correct picks earn small bonus points after the draw.
      </p>
      <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto">
        {participants.map((p) => (
          <button
            key={p.userId}
            type="button"
            onClick={() => setPick(p.userId)}
            className={`text-left text-xs rounded-lg border px-2 py-2 ${
              pick === p.userId ? "border-primary bg-primary/15" : "border-border"
            }`}
          >
            {p.displayName}
          </button>
        ))}
      </div>
      <Button size="sm" className="w-full" disabled={pick == null} onClick={() => void submit()}>
        Lock prediction
      </Button>
    </div>
  );
}
