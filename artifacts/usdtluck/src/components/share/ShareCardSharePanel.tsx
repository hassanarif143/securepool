import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { apiUrl } from "@/lib/api-base";
import { useToast } from "@/hooks/use-toast";
import { ShareCardVisual, buildShareMessage, type ShareCardRecord } from "@/components/share/ShareCardVisual";
import { referralInviteUrl } from "@/lib/share-links";
import type { ShareImageFormat } from "@/lib/share-service";
import {
  downloadPNG,
  isMobileUa,
  shareFacebook,
  shareInstagram,
  shareTelegram,
  shareWhatsApp,
  shareWhatsAppStatus,
  shareWithImage,
  shareX,
  copyLink as copyLinkSvc,
} from "@/lib/share-service";

const BG = "#0a1628";

async function trackShareApi(cardId: number, platform: string) {
  await fetch(apiUrl(`/api/share-cards/${cardId}/track-share`), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ platform }),
  });
}

type ShareBtnDef = {
  id: string;
  label: string;
  icon: string;
  color: string;
  bgTint: string;
  borderTint: string;
  format?: ShareImageFormat;
};

const SHARE_BUTTONS: ShareBtnDef[] = [
  { id: "whatsapp", label: "WhatsApp", icon: "💬", color: "#25D366", bgTint: "rgba(37,211,102,0.1)", borderTint: "rgba(37,211,102,0.25)" },
  {
    id: "whatsapp_status",
    label: "WA Status",
    icon: "📱",
    color: "#25D366",
    bgTint: "rgba(37,211,102,0.1)",
    borderTint: "rgba(37,211,102,0.25)",
    format: "story",
  },
  { id: "facebook", label: "Facebook", icon: "📘", color: "#1877F2", bgTint: "rgba(24,119,242,0.1)", borderTint: "rgba(24,119,242,0.25)" },
  {
    id: "instagram",
    label: "Instagram",
    icon: "📷",
    color: "#E4405F",
    bgTint: "rgba(228,64,95,0.1)",
    borderTint: "rgba(228,64,95,0.25)",
    format: "story",
  },
  { id: "telegram", label: "Telegram", icon: "✈️", color: "#0088cc", bgTint: "rgba(0,136,204,0.1)", borderTint: "rgba(0,136,204,0.25)" },
  { id: "x", label: "X", icon: "𝕏", color: "#ffffff", bgTint: "rgba(255,255,255,0.06)", borderTint: "rgba(255,255,255,0.15)" },
];

function SharePlatformButton({
  def,
  busy: busyProp,
  done,
  onClick,
}: {
  def: ShareBtnDef;
  busy: boolean;
  done: boolean;
  onClick: () => Promise<void>;
}) {
  const [hovered, setHovered] = useState(false);
  const [localLoading, setLocalLoading] = useState(false);

  const busy = busyProp || localLoading;

  return (
    <button
      type="button"
      onClick={async () => {
        setLocalLoading(true);
        try {
          await onClick();
        } finally {
          setLocalLoading(false);
        }
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      disabled={busy}
      className="flex flex-col items-center gap-1.5 rounded-xl border px-2 py-3 transition-all min-w-[76px] flex-1"
      style={{
        borderColor: hovered ? def.borderTint : "rgba(255,255,255,0.06)",
        background: hovered ? def.bgTint : "rgba(255,255,255,0.02)",
        cursor: busy ? "wait" : "pointer",
      }}
    >
      <span className="text-[22px] leading-none">{busy ? "⏳" : done ? "✅" : def.icon}</span>
      <span
        className="text-[11px] font-medium text-center leading-tight max-w-[84px]"
        style={{ color: hovered ? def.color : "#8899aa" }}
      >
        {busy ? "Preparing…" : done ? "Done!" : def.label}
      </span>
    </button>
  );
}

export function ShareCardSharePanel({ card }: { card: ShareCardRecord }) {
  const { toast } = useToast();
  const captureRef = useRef<HTMLDivElement>(null);
  const [shareFormat, setShareFormat] = useState<ShareImageFormat>("card");
  const [btnLoading, setBtnLoading] = useState<string | null>(null);
  const [btnDone, setBtnDone] = useState<string | null>(null);

  const inviteUrl = referralInviteUrl(card.referralCode ?? "invite", { shareCardId: card.id });

  function effectiveFormat(btn: ShareBtnDef): ShareImageFormat {
    if (btn.format) return btn.format;
    return shareFormat;
  }

  async function runShareAction(btnId: string, fmt: ShareImageFormat) {
    const el = captureRef.current;
    const text = buildShareMessage(card, inviteUrl);
    if (!el) {
      toast({ variant: "destructive", title: "Card not ready" });
      return;
    }

    setBtnLoading(btnId);
    try {
      switch (btnId) {
        case "whatsapp":
          await shareWhatsApp(el, text, fmt);
          await trackShareApi(card.id, "whatsapp");
          break;
        case "whatsapp_status":
          await shareWhatsAppStatus(el, text);
          await trackShareApi(card.id, "whatsapp_status");
          break;
        case "facebook":
          await shareFacebook(el, text, fmt);
          await trackShareApi(card.id, "facebook");
          break;
        case "instagram":
          await shareInstagram(el, text);
          await trackShareApi(card.id, "instagram");
          break;
        case "telegram":
          await shareTelegram(el, text, fmt, inviteUrl);
          await trackShareApi(card.id, "telegram");
          break;
        case "x":
          await shareX(el, text);
          await trackShareApi(card.id, "twitter");
          break;
        default:
          break;
      }
      setBtnDone(btnId);
      window.setTimeout(() => setBtnDone(null), 2000);
      if (!isMobileUa() && ["whatsapp", "facebook", "telegram", "x"].includes(btnId)) {
        toast({
          title: "Image saved",
          description: "On desktop, attach the downloaded PNG in your app if needed.",
        });
      }
    } catch (e: unknown) {
      toast({ variant: "destructive", title: "Share failed", description: e instanceof Error ? e.message : "Error" });
    } finally {
      setBtnLoading(null);
    }
  }

  async function nativeShareSheet() {
    const el = captureRef.current;
    const text = buildShareMessage(card, inviteUrl);
    if (!el) return;
    setBtnLoading("native");
    try {
      const r = await shareWithImage(el, text, shareFormat);
      if (r.success && r.method !== "cancelled") {
        await trackShareApi(card.id, "web_share");
        toast({ title: "Shared" });
      }
    } catch {
      /* handled in service */
    } finally {
      setBtnLoading(null);
    }
  }

  async function copyLink() {
    try {
      await copyLinkSvc(inviteUrl);
      void trackShareApi(card.id, "copy_link");
      toast({ title: "Link copied" });
    } catch {
      toast({ variant: "destructive", title: "Copy failed" });
    }
  }

  return (
    <div className="space-y-4 flex flex-col items-stretch">
      <div
        ref={captureRef}
        style={{
          padding: 24,
          background: BG,
          display: "inline-block",
          borderRadius: 12,
          alignSelf: "center",
        }}
      >
        <ShareCardVisual card={card} inviteUrl={inviteUrl} />
      </div>

      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">Format</p>
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["card", "Card"],
              ["post", "Post 1080×1080"],
              ["story", "Story 1080×1920"],
            ] as const
          ).map(([v, label]) => (
            <button
              key={v}
              type="button"
              onClick={() => setShareFormat(v)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium border transition-colors ${
                shareFormat === v
                  ? "border-[#00e5a0] bg-[#00e5a0]/15 text-[#00e5a0]"
                  : "border-white/10 bg-white/5 text-muted-foreground hover:bg-white/10"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {typeof navigator !== "undefined" && typeof navigator.share === "function" && (
        <Button
          type="button"
          variant="secondary"
          className="w-full"
          disabled={btnLoading != null}
          onClick={() => void nativeShareSheet()}
        >
          {btnLoading === "native" ? "Opening share…" : "Share… (system sheet)"}
        </Button>
      )}

      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">Share to</p>
        <div className="flex flex-wrap gap-2 justify-center">
          {SHARE_BUTTONS.map((def) => (
            <SharePlatformButton
              key={def.id}
              def={def}
              busy={btnLoading === def.id}
              done={btnDone === def.id}
              onClick={() => runShareAction(def.id, effectiveFormat(def))}
            />
          ))}
        </div>
      </div>

      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">Or save</p>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            className="flex-1"
            onClick={async () => {
              const el = captureRef.current;
              if (!el) return;
              try {
                await downloadPNG(el, `securepool-card-${card.id}.png`, shareFormat);
                void trackShareApi(card.id, "download");
                toast({ title: "PNG saved" });
              } catch {
                toast({ variant: "destructive", title: "Download failed" });
              }
            }}
          >
            📥 Save PNG
          </Button>
          <Button
            type="button"
            variant="outline"
            className="flex-1"
            onClick={async () => {
              const el = captureRef.current;
              if (!el) return;
              try {
                await downloadPNG(el, `securepool-story-${card.id}.png`, "story");
                void trackShareApi(card.id, "instagram_story");
                toast({ title: "Story size saved" });
              } catch {
                toast({ variant: "destructive", title: "Download failed" });
              }
            }}
          >
            📐 Save as story
          </Button>
        </div>
      </div>

      <Button type="button" variant="secondary" className="w-full" onClick={() => void copyLink()}>
        🔗 Copy referral link
      </Button>
    </div>
  );
}
