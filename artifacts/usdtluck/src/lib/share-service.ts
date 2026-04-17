import html2canvas from "html2canvas";

export type ShareImageFormat = "card" | "story" | "post";

const CARD_SCALE = 3;
const BG = "#0a1628";

function siteWatermark(): string {
  if (typeof window === "undefined") return "SecurePool";
  const h = window.location.hostname;
  return h && h !== "localhost" ? h : "securepool.vercel.app";
}

function prepareCloneForCapture(_clonedDoc: Document, clonedElement: HTMLElement) {
  clonedElement.querySelectorAll("*").forEach((el) => {
    const h = el as HTMLElement;
    h.style.animation = "none";
    h.style.transition = "none";
    h.style.animationDelay = "0s";
  });
  clonedElement.querySelectorAll('[data-particle="true"]').forEach((el) => {
    const h = el as HTMLElement;
    h.style.opacity = "0.45";
    h.style.transform = "scale(1)";
  });
  clonedElement.querySelectorAll('[data-gradient-text="true"]').forEach((el) => {
    const h = el as HTMLElement;
    const fb = h.getAttribute("data-fallback-color") || "#ffd700";
    h.style.color = fb;
    h.style.webkitTextFillColor = fb;
    h.style.background = "none";
    h.style.backgroundClip = "border-box";
    h.style.webkitBackgroundClip = "border-box";
  });
}

export async function generateCardImage(
  cardElement: HTMLElement,
  format: ShareImageFormat = "card",
): Promise<HTMLCanvasElement> {
  const configs: Record<ShareImageFormat, { scale: number }> = {
    card: { scale: CARD_SCALE },
    story: { scale: CARD_SCALE },
    post: { scale: CARD_SCALE },
  };
  const scale = configs[format].scale;

  const canvas = await html2canvas(cardElement, {
    scale,
    backgroundColor: BG,
    useCORS: true,
    allowTaint: true,
    logging: false,
    onclone: (_clonedDoc, clonedElement) => {
      prepareCloneForCapture(_clonedDoc, clonedElement);
    },
  });

  if (format === "story" || format === "post") {
    const targetW = 1080;
    const targetH = format === "story" ? 1920 : 1080;
    const wrapper = document.createElement("canvas");
    wrapper.width = targetW;
    wrapper.height = targetH;
    const ctx = wrapper.getContext("2d");
    if (!ctx) return canvas;

    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, targetW, targetH);

    const cardW = canvas.width;
    const cardH = canvas.height;
    const maxW = targetW * 0.82;
    const maxH = targetH * 0.82;
    const scaleFactor = Math.min(maxW / cardW, maxH / cardH);
    const drawW = cardW * scaleFactor;
    const drawH = cardH * scaleFactor;
    const drawX = (targetW - drawW) / 2;
    const drawY = (targetH - drawH) / 2;

    ctx.drawImage(canvas, drawX, drawY, drawW, drawH);

    ctx.fillStyle = "rgba(255,255,255,0.14)";
    ctx.font = "14px system-ui, -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(siteWatermark(), targetW / 2, targetH - 28);

    return wrapper;
  }

  return canvas;
}

export function canvasToFile(canvas: HTMLCanvasElement, filename = "securepool-card.png"): Promise<File> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("toBlob failed"));
          return;
        }
        resolve(new File([blob], filename, { type: "image/png" }));
      },
      "image/png",
      1,
    );
  });
}

function downloadCanvas(canvas: HTMLCanvasElement, filename = "securepool-card.png") {
  const link = document.createElement("a");
  link.download = filename;
  link.href = canvas.toDataURL("image/png", 1);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function isMobileUa(): boolean {
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

export async function shareWithImage(
  cardElement: HTMLElement,
  shareText: string,
  format: ShareImageFormat = "card",
): Promise<{ success: boolean; method: string }> {
  try {
    const canvas = await generateCardImage(cardElement, format);
    const file = await canvasToFile(canvas, "securepool-card.png");

    if (navigator.share && typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
      await navigator.share({ text: shareText, files: [file] });
      return { success: true, method: "native" };
    }
    downloadCanvas(canvas);
    return { success: true, method: "download" };
  } catch (err: unknown) {
    const e = err as { name?: string };
    if (e?.name === "AbortError") {
      return { success: false, method: "cancelled" };
    }
    console.error("[share] shareWithImage", err);
    try {
      const canvas = await generateCardImage(cardElement, format);
      downloadCanvas(canvas);
      return { success: true, method: "download_fallback" };
    } catch {
      return { success: false, method: "error" };
    }
  }
}

export async function shareWhatsApp(cardElement: HTMLElement, shareText: string, format: ShareImageFormat) {
  if (isMobileUa()) {
    return shareWithImage(cardElement, shareText, format);
  }
  const canvas = await generateCardImage(cardElement, format);
  downloadCanvas(canvas, "securepool-card.png");
  window.setTimeout(() => {
    window.open(`https://wa.me/?text=${encodeURIComponent(shareText)}`, "_blank");
  }, 400);
  return { success: true, method: "desktop_whatsapp" };
}

export async function shareWhatsAppStatus(cardElement: HTMLElement, shareText: string) {
  return shareWithImage(cardElement, shareText, "story");
}

export async function shareFacebook(cardElement: HTMLElement, shareText: string, format: ShareImageFormat) {
  if (isMobileUa()) {
    return shareWithImage(cardElement, shareText, format);
  }
  const canvas = await generateCardImage(cardElement, format);
  downloadCanvas(canvas);
  return { success: true, method: "download" };
}

export async function shareInstagram(cardElement: HTMLElement, shareText: string) {
  return shareWithImage(cardElement, shareText, "story");
}

export async function shareTelegram(
  cardElement: HTMLElement,
  shareText: string,
  format: ShareImageFormat,
  pageUrl: string,
) {
  if (isMobileUa()) {
    return shareWithImage(cardElement, shareText, format);
  }
  const canvas = await generateCardImage(cardElement, format);
  downloadCanvas(canvas);
  window.setTimeout(() => {
    window.open(
      `https://t.me/share/url?url=${encodeURIComponent(pageUrl)}&text=${encodeURIComponent(shareText)}`,
      "_blank",
    );
  }, 400);
  return { success: true, method: "desktop_telegram" };
}

export async function shareX(cardElement: HTMLElement, shareText: string) {
  const canvas = await generateCardImage(cardElement, "post");
  downloadCanvas(canvas, "securepool-card.png");
  window.setTimeout(() => {
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}`, "_blank");
  }, 400);
  return { success: true, method: "x_intent" };
}

export async function downloadPNG(cardElement: HTMLElement, filename: string, format: ShareImageFormat) {
  const canvas = await generateCardImage(cardElement, format);
  downloadCanvas(canvas, filename);
}

export async function copyLink(refLink: string): Promise<boolean> {
  await navigator.clipboard.writeText(refLink);
  return true;
}
