import { useCallback, useEffect, useRef, useState } from "react";
import html2canvas from "html2canvas";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { apiUrl, readApiErrorMessage } from "@/lib/api-base";
import { useToast } from "@/hooks/use-toast";
import { ShareCardVisual, buildShareMessage, type ShareCardRecord } from "@/components/share/ShareCardVisual";
import { referralInviteUrl } from "@/lib/share-links";

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
  const [storyCard, setStoryCard] = useState<ShareCardRecord | null>(null);
  const exportRef = useRef<HTMLDivElement>(null);
  const storyRef = useRef<HTMLDivElement>(null);

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
      if (!wrap?.firstElementChild) return;
      try {
        const canvas = await html2canvas(wrap.firstElementChild as HTMLElement, {
          backgroundColor: "#0a0f1a",
          scale: 2,
          useCORS: true,
        });
        const a = document.createElement("a");
        a.download = `securepool-card-${exportCard.id}.png`;
        a.href = canvas.toDataURL("image/png");
        a.click();
        void trackShareApi(exportCard.id, "download");
        toast({ title: "Downloaded" });
      } catch {
        toast({ variant: "destructive", title: "Could not render image" });
      } finally {
        setExportCard(null);
      }
    };
    void run();
  }, [exportCard, toast]);

  useEffect(() => {
    if (!storyCard) return;
    const run = async () => {
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const wrap = storyRef.current;
      if (!wrap) return;
      try {
        const canvas = await html2canvas(wrap, {
          width: 1080,
          height: 1920,
          scale: 1,
          backgroundColor: "#070d18",
          useCORS: true,
        });
        const a = document.createElement("a");
        a.download = `securepool-story-${storyCard.id}.png`;
        a.href = canvas.toDataURL("image/png");
        a.click();
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

  function downloadPng(card: ShareCardRecord) {
    setExportCard(card);
  }

  function downloadStory(card: ShareCardRecord) {
    setStoryCard(card);
  }

  function openWhatsApp(card: ShareCardRecord) {
    const url = inviteFor(card);
    const text = buildShareMessage(card, url);
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
    void trackShareApi(card.id, "whatsapp");
  }

  function openTwitter(card: ShareCardRecord) {
    const url = inviteFor(card);
    const text = buildShareMessage(card, url);
    window.open(
      `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`,
      "_blank",
    );
    void trackShareApi(card.id, "twitter");
  }

  async function copyLink(card: ShareCardRecord) {
    const url = inviteFor(card);
    try {
      await navigator.clipboard.writeText(url);
      void trackShareApi(card.id, "copy_link");
      toast({ title: "Link copied" });
    } catch {
      toast({ variant: "destructive", title: "Copy failed" });
    }
  }

  return (
    <div className="wrap space-y-6">
      <div className="fixed -left-[10000px] top-0 opacity-0 pointer-events-none" aria-hidden>
        <div ref={exportRef}>
          {exportCard ? <ShareCardVisual card={exportCard} inviteUrl={inviteFor(exportCard)} /> : null}
        </div>
        {storyCard ? (
          <div
            ref={storyRef}
            style={{
              width: 1080,
              height: 1920,
              background: "linear-gradient(180deg,#050810 0%,#0c1829 45%,#050810 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
            }}
          >
            <div style={{ transform: "scale(1.72)", transformOrigin: "center center" }}>
              <ShareCardVisual card={storyCard} inviteUrl={inviteFor(storyCard)} />
            </div>
          </div>
        ) : null}
      </div>

      <div>
        <h1 className="text-2xl font-bold">📤 My shared moments</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Download branded cards or share to WhatsApp / X. Your referral link is on every card.
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
                <Button size="sm" variant="outline" onClick={() => downloadPng(card)}>
                  PNG
                </Button>
                <Button size="sm" variant="outline" onClick={() => downloadStory(card)} title="1080×1920 for Instagram Stories">
                  Story
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={active != null} onOpenChange={(o) => !o && setActive(null)}>
        <DialogContent className="max-w-[420px] max-h-[90vh] overflow-y-auto border-emerald-500/20">
          <DialogHeader>
            <DialogTitle>Share</DialogTitle>
          </DialogHeader>
          {active ? (
            <div className="space-y-3 flex flex-col items-center">
              <ShareCardVisual card={active} inviteUrl={inviteFor(active)} />
              <div className="flex flex-wrap gap-2 justify-center w-full">
                <Button type="button" size="sm" onClick={() => openWhatsApp(active)}>
                  WhatsApp
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => openTwitter(active)}>
                  X
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => void copyLink(active)}>
                  Copy link
                </Button>
                <Button type="button" size="sm" variant="secondary" onClick={() => downloadPng(active)}>
                  Download PNG
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => downloadStory(active)}>
                  Story 1080×1920
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
