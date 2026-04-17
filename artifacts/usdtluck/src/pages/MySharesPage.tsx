import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiUrl, readApiErrorMessage } from "@/lib/api-base";
import { useToast } from "@/hooks/use-toast";
import { ShareCardVisual, type ShareCardRecord } from "@/components/share/ShareCardVisual";
import { ShareCardSharePanel } from "@/components/share/ShareCardSharePanel";
import { referralInviteUrl } from "@/lib/share-links";
import { downloadPNG } from "@/lib/share-service";
import type { ShareImageFormat } from "@/lib/share-service";

const BG = "#0a1628";

async function trackShareApi(cardId: number, platform: string) {
  await fetch(apiUrl(`/api/share-cards/${cardId}/track-share`), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ platform }),
  });
}

export default function MySharesPage() {
  const { toast } = useToast();
  const [cards, setCards] = useState<ShareCardRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<{ totalShares: number; byPlatform: Record<string, number> } | null>(null);
  const [active, setActive] = useState<ShareCardRecord | null>(null);
  const [exportCard, setExportCard] = useState<ShareCardRecord | null>(null);
  const [exportFormat, setExportFormat] = useState<ShareImageFormat>("card");
  const [storyCard, setStoryCard] = useState<ShareCardRecord | null>(null);

  const exportRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cRes, sRes] = await Promise.all([
        fetch(apiUrl("/api/share-cards/my-cards?limit=50"), { credentials: "include" }),
        fetch(apiUrl("/api/share-cards/my-stats"), { credentials: "include" }),
      ]);
      if (!cRes.ok) throw new Error(await readApiErrorMessage(cRes));
      const cj = await cRes.json();
      setCards(
        (cj.cards ?? []).map((row: Record<string, unknown>) => ({
          id: row.id as number,
          cardType: String(row.cardType ?? row.card_type ?? ""),
          cardData: (row.cardData ?? row.card_data) as Record<string, unknown>,
          referralCode: (row.referralCode ?? row.referral_code) as string | null,
          shareCount: Number(row.shareCount ?? row.share_count ?? 0),
          createdAt: String(row.createdAt ?? row.created_at ?? ""),
        })),
      );
      if (sRes.ok) setStats(await sRes.json());
    } catch (e: unknown) {
      toast({ variant: "destructive", title: "Could not load shares", description: e instanceof Error ? e.message : "Error" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const inviteFor = (card: ShareCardRecord) => referralInviteUrl(card.referralCode ?? "invite", { shareCardId: card.id });

  useEffect(() => {
    if (!exportCard) return;
    const run = async () => {
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const wrap = exportRef.current;
      if (!wrap) return;
      try {
        await downloadPNG(wrap, `securepool-card-${exportCard.id}.png`, exportFormat);
        void trackShareApi(exportCard.id, "download");
        toast({ title: "Downloaded" });
      } catch {
        toast({ variant: "destructive", title: "Could not render image" });
      } finally {
        setExportCard(null);
      }
    };
    void run();
  }, [exportCard, exportFormat, toast]);

  useEffect(() => {
    if (!storyCard) return;
    const run = async () => {
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const wrap = exportRef.current;
      if (!wrap) return;
      try {
        await downloadPNG(wrap, `securepool-story-${storyCard.id}.png`, "story");
        void trackShareApi(storyCard.id, "instagram_story");
        toast({ title: "Story image (1080×1920) saved" });
      } catch {
        toast({ variant: "destructive", title: "Could not render story image" });
      } finally {
        setStoryCard(null);
      }
    };
    void run();
  }, [storyCard, toast]);

  const offscreenExport = exportCard ?? storyCard;

  return (
    <div className="wrap space-y-6">
      <div className="fixed -left-[12000px] top-0 opacity-0 pointer-events-none" aria-hidden>
        <div
          ref={exportRef}
          style={{
            padding: 24,
            background: BG,
            display: "inline-block",
            borderRadius: 12,
          }}
        >
          {offscreenExport ? <ShareCardVisual card={offscreenExport} inviteUrl={inviteFor(offscreenExport)} /> : null}
        </div>
      </div>

      <div>
        <h1 className="text-2xl font-bold">📤 My shared moments</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Share a real card image to WhatsApp, Status, Facebook, and more — or save a high-quality PNG.
        </p>
      </div>

      {stats ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs rounded-xl border p-3 bg-card/30">
          <div>
            <p className="text-muted-foreground">Total shares (tracked)</p>
            <p className="text-lg font-semibold text-emerald-400">{stats.totalShares}</p>
          </div>
          <div className="col-span-3 text-muted-foreground text-[11px]">
            {Object.entries(stats.byPlatform ?? {}).map(([k, v]) => (
              <span key={k} className="mr-3">
                {k}: {v}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : cards.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No share cards yet — pool wins, referral bonuses, and withdrawals create them automatically.
        </p>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {cards.map((card) => (
            <div
              key={card.id}
              className="rounded-xl border p-3 space-y-2 bg-card/20"
              style={{ borderColor: "hsl(217,28%,16%)" }}
            >
              <p className="text-xs font-semibold text-muted-foreground uppercase">{card.cardType.replace(/_/g, " ")}</p>
              <p className="text-sm font-medium line-clamp-2">
                {String(card.cardData.username ?? "")}{" "}
                {"amount" in card.cardData ? `· $${String(card.cardData.amount)}` : ""}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {new Date(card.createdAt).toLocaleString()} · Shared {card.shareCount}×
              </p>
              <div className="flex flex-wrap gap-1">
                <Button size="sm" variant="default" onClick={() => setActive(card)}>
                  Open &amp; share
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setExportFormat("card");
                    setExportCard(card);
                  }}
                >
                  PNG
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setStoryCard(card)}
                  title="1080×1920 for Instagram Stories"
                >
                  Story
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={active != null} onOpenChange={(o) => !o && setActive(null)}>
        <DialogContent className="max-h-[92vh] w-[calc(100vw-1.25rem)] max-w-[min(440px,calc(100vw-1.25rem))] overflow-y-auto overflow-x-hidden border-emerald-500/20 p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>Share</DialogTitle>
          </DialogHeader>
          {active ? <ShareCardSharePanel card={active} /> : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
