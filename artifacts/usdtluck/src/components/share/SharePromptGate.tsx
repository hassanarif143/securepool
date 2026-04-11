import { useCallback, useEffect, useState } from "react";
import { Link } from "wouter";
import { useAuth } from "@/context/AuthContext";
import { apiUrl } from "@/lib/api-base";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ShareCardVisual, type ShareCardRecord } from "@/components/share/ShareCardVisual";
import { referralInviteUrl } from "@/lib/share-links";

const LS_DISMISSED = "securepool_share_prompt_dismissed_ids";
const LS_NEVER_GENERIC = "securepool_share_prompt_never_generic";
const SESS_GENERIC = "securepool_share_generic_session_count";
const SESS_SHOWN = "securepool_share_prompt_session_ids";

function loadDismissed(): Set<number> {
  try {
    const raw = localStorage.getItem(LS_DISMISSED);
    const arr = raw ? (JSON.parse(raw) as unknown) : [];
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr.filter((x): x is number => typeof x === "number"));
  } catch {
    return new Set();
  }
}

function saveDismissedId(id: number) {
  const s = loadDismissed();
  s.add(id);
  localStorage.setItem(LS_DISMISSED, JSON.stringify([...s].slice(-200)));
}

function isNeverGeneric(): boolean {
  return localStorage.getItem(LS_NEVER_GENERIC) === "1";
}

function genericSessionCount(): number {
  const v = sessionStorage.getItem(SESS_GENERIC);
  return v ? parseInt(v, 10) || 0 : 0;
}

function bumpGenericSession() {
  const n = genericSessionCount() + 1;
  sessionStorage.setItem(SESS_GENERIC, String(n));
}

function loadSessionPrompted(): Set<number> {
  try {
    const raw = sessionStorage.getItem(SESS_SHOWN);
    const arr = raw ? (JSON.parse(raw) as unknown) : [];
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr.filter((x): x is number => typeof x === "number"));
  } catch {
    return new Set();
  }
}

function markSessionPrompted(id: number) {
  const s = loadSessionPrompted();
  s.add(id);
  sessionStorage.setItem(SESS_SHOWN, JSON.stringify([...s].slice(-100)));
}

const GENERIC_TYPES = new Set([
  "referral_earned",
  "withdrawal_success",
  "level_up",
  "achievement_unlocked",
  "login_streak",
  "pool_streak",
]);

/**
 * Fullscreen-adjacent prompt for new share cards: pool wins always (until dismissed per card);
 * other types at most once per session if user did not opt out.
 */
export function SharePromptGate() {
  const { user } = useAuth();
  const [card, setCard] = useState<ShareCardRecord | null>(null);
  const [open, setOpen] = useState(false);

  const pickCard = useCallback((rows: ShareCardRecord[]) => {
    const dismissed = loadDismissed();
    const sessionPrompted = loadSessionPrompted();
    const sorted = [...rows].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const poolWin = sorted.find(
      (c) => c.cardType === "pool_win" && !dismissed.has(c.id) && !sessionPrompted.has(c.id),
    );
    if (poolWin) {
      markSessionPrompted(poolWin.id);
      setCard(poolWin);
      setOpen(true);
      return;
    }

    if (isNeverGeneric()) return;
    if (genericSessionCount() >= 1) return;

    const generic = sorted.find(
      (c) => GENERIC_TYPES.has(c.cardType) && !dismissed.has(c.id) && !sessionPrompted.has(c.id),
    );
    if (generic) {
      markSessionPrompted(generic.id);
      setCard(generic);
      setOpen(true);
      bumpGenericSession();
    }
  }, []);

  useEffect(() => {
    if (!user) return;

    let cancelled = false;
    async function run() {
      try {
        const res = await fetch(apiUrl("/api/share-cards/my-cards?limit=15"), { credentials: "include" });
        if (!res.ok || cancelled) return;
        const j = await res.json();
        const rows = (j.cards ?? []).map((row: Record<string, unknown>) => ({
          id: row.id as number,
          cardType: String(row.cardType ?? row.card_type ?? ""),
          cardData: (row.cardData ?? row.card_data) as Record<string, unknown>,
          referralCode: (row.referralCode ?? row.referral_code) as string | null,
          shareCount: Number(row.shareCount ?? row.share_count ?? 0),
          createdAt: String(row.createdAt ?? row.created_at ?? ""),
        })) as ShareCardRecord[];
        if (rows.length === 0 || cancelled) return;
        pickCard(rows);
      } catch {
        /* ignore */
      }
    }

    void run();
    const id = window.setInterval(run, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [user, pickCard]);

  const inviteUrl = card ? referralInviteUrl(card.referralCode ?? "invite", { shareCardId: card.id }) : "";

  function handleLater() {
    if (card) saveDismissedId(card.id);
    setOpen(false);
    setCard(null);
  }

  function handleNeverGeneric() {
    localStorage.setItem(LS_NEVER_GENERIC, "1");
    if (card) saveDismissedId(card.id);
    setOpen(false);
    setCard(null);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleLater()}>
      <DialogContent className="max-w-[440px] max-h-[92vh] overflow-y-auto border-emerald-500/25 sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>Share your moment</DialogTitle>
          <DialogDescription>
            Branded card with your referral link — post to WhatsApp or download from My Shares.
          </DialogDescription>
        </DialogHeader>
        {card ? (
          <div className="flex flex-col items-center gap-3 py-1">
            <ShareCardVisual card={card} inviteUrl={inviteUrl} />
            <div className="flex flex-wrap gap-2 justify-center w-full">
              <Button asChild size="sm">
                <Link href="/my-shares">Open My Shares</Link>
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={handleLater}>
                Not now
              </Button>
            </div>
            {card.cardType !== "pool_win" ? (
              <Button type="button" variant="ghost" size="sm" className="text-muted-foreground text-xs" onClick={handleNeverGeneric}>
                Don&apos;t show these prompts
              </Button>
            ) : null}
          </div>
        ) : null}
        <DialogFooter className="sm:justify-center">
          <p className="text-[11px] text-muted-foreground text-center w-full">
            Pool wins surface here when new; other prompts are limited per session.
          </p>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
