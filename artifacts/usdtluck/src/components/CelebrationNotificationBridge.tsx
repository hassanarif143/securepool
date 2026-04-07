import { useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { useCelebration } from "@/context/CelebrationContext";
import { useToast } from "@/hooks/use-toast";
import { apiUrl } from "@/lib/api-base";
import { getSeenCelebrationNotificationIds, markCelebrationNotificationSeen } from "@/lib/celebration-preferences";
import type { CelebrationQueueItem } from "@/lib/celebration-types";

type NotifRow = {
  id: number;
  type: string;
  title: string;
  message: string;
  read: boolean;
  created_at: string;
};

const AWAY_MS = 120_000;

function parseUsdt(msg: string): number | undefined {
  const m = msg.match(/([\d.]+)\s*USDT/i);
  return m ? parseFloat(m[1]) : undefined;
}

function parsePoolIdFromWin(msg: string): number | undefined {
  const m = msg.match(/\(pool #(\d+)\)/i);
  return m ? parseInt(m[1], 10) : undefined;
}

function parsePlace(msg: string): 1 | 2 | 3 | undefined {
  if (/\b1st\b/i.test(msg)) return 1;
  if (/\b2nd\b/i.test(msg)) return 2;
  if (/\b3rd\b/i.test(msg)) return 3;
  return undefined;
}

type MapResult =
  | { kind: "celebration"; item: CelebrationQueueItem }
  | { kind: "toast"; title: string; description: string }
  | { kind: "skip" };

function mapNotification(n: NotifRow): MapResult {
  const age = Date.now() - new Date(n.created_at).getTime();
  const away = age > AWAY_MS;

  if (n.title === "Prize awarded" || n.type === "win") {
    const amount = parseUsdt(n.message);
    const place = parsePlace(n.message);
    const poolId = parsePoolIdFromWin(n.message);
    return {
      kind: "celebration",
      item: {
        kind: "win",
        title: "🎉 Congratulations!",
        message: n.message,
        subtitle: away ? "While you were away…" : undefined,
        amount,
        place,
        dedupeKey: poolId != null ? `win-pool-${poolId}` : `notif-win-${n.id}`,
        primaryLabel: "Claim prize",
      },
    };
  }

  if (n.type === "referral" || n.title.includes("Referral reward")) {
    const amount = parseUsdt(n.message);
    return {
      kind: "celebration",
      item: {
        kind: "referral",
        title: "👥 Referral bonus!",
        message: n.message,
        subtitle: away ? "While you were away…" : undefined,
        amount,
        dedupeKey: `notif-${n.id}`,
      },
    };
  }

  if (n.title === "Referral tier milestone" || n.type === "tier") {
    const amount = parseUsdt(n.message);
    return {
      kind: "celebration",
      item: {
        kind: "tier",
        title: "🏆 Tier milestone!",
        message: n.message,
        subtitle: away ? "While you were away…" : undefined,
        amount,
        progress: 1,
        dedupeKey: `notif-${n.id}`,
      },
    };
  }

  /* Streak popups are enqueued on pool join; avoid duplicate from notifications */
  if (n.title === "Streak milestone" || n.title.startsWith("On Fire")) {
    return { kind: "skip" };
  }

  if (n.title.includes("First deposit bonus")) {
    const amount = parseUsdt(n.message);
    return {
      kind: "celebration",
      item: {
        kind: "deposit",
        title: "🎁 Welcome reward!",
        message: n.message,
        subtitle: away ? "While you were away…" : undefined,
        amount,
        dedupeKey: `notif-${n.id}`,
      },
    };
  }

  if (n.title === "Referral milestone") {
    return {
      kind: "celebration",
      item: {
        kind: "referral",
        title: "👥 Referral milestone!",
        message: n.message,
        subtitle: away ? "While you were away…" : undefined,
        dedupeKey: `notif-${n.id}`,
      },
    };
  }

  if (n.title === "Loyalty reward") {
    return {
      kind: "toast",
      title: "Loyalty reward",
      description: n.message,
    };
  }

  return { kind: "skip" };
}

export function CelebrationNotificationBridge() {
  const { user } = useAuth();
  const { enqueue } = useCelebration();
  const { toast } = useToast();

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    function process(rows: NotifRow[]) {
      if (cancelled) return;
      const seen = getSeenCelebrationNotificationIds();
      for (const n of rows) {
        if (seen.has(n.id)) continue;
        const mapped = mapNotification(n);
        if (mapped.kind === "skip") {
          if (n.title === "Streak milestone" || n.title.startsWith("On Fire")) {
            markCelebrationNotificationSeen(n.id);
          }
          continue;
        }
        if (mapped.kind === "toast") {
          markCelebrationNotificationSeen(n.id);
          toast({ title: mapped.title, description: mapped.description });
          continue;
        }
        markCelebrationNotificationSeen(n.id);
        enqueue(mapped.item);
      }
    }

    function poll() {
      fetch(apiUrl("/api/notifications"), { credentials: "include" })
        .then((r) => (r.ok ? r.json() : []))
        .then((rows: NotifRow[]) => {
          if (!Array.isArray(rows)) return;
          process(rows);
        })
        .catch(() => {});
    }

    poll();
    const id = setInterval(poll, 45_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [user, enqueue, toast]);

  return null;
}
