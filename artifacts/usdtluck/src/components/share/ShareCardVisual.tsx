import type { CSSProperties } from "react";
import { ShareCardBody } from "@/components/share/share-card-bodies";
import { ShareCardKeyframes } from "@/components/share/share-card-primitives";
import type { ShareCardRecord } from "@/components/share/share-card-types";

export type { ShareCardRecord } from "@/components/share/share-card-types";

export function buildShareMessage(card: ShareCardRecord, inviteUrl: string): string {
  const d = card.cardData;
  const amt = String(d.amount ?? "");
  switch (card.cardType) {
    case "pool_win":
      return `I just won $${amt} USDT on SecurePool! 🏆 Provably fair draws — verify it yourself. Try your luck → ${inviteUrl}`;
    case "first_win":
      return `My first win on SecurePool — $${amt} USDT! ✨ Join me → ${inviteUrl}`;
    case "game_win":
      return `Just won $${String(d.win_amount ?? d.amount ?? "")} USDT on SecurePool games! 🎮 → ${inviteUrl}`;
    case "referral_earned":
      return `Just earned $${amt} USDT by inviting a friend to SecurePool! 🤝 You can earn too → ${inviteUrl}`;
    case "withdrawal_success":
      return `Just withdrew $${amt} USDT from SecurePool! 💸 Real money, real fast. → ${inviteUrl}`;
    case "achievement_unlocked":
      return `Unlocked '${String(d.achievement_name ?? "badge")}' on SecurePool! ${inviteUrl}`;
    case "level_up":
      return `⬆️ Leveled up to ${String(d.new_level ?? "")} on SecurePool! → ${inviteUrl}`;
    case "login_streak":
      return `🔥 ${String(d.streak_days ?? "")}-day login streak on SecurePool! → ${inviteUrl}`;
    case "pool_streak":
      return `🔥 ${String(d.streak_days ?? "")} pools in a row on SecurePool! → ${inviteUrl}`;
    default:
      return `Check out SecurePool → ${inviteUrl}`;
  }
}

export function ShareCardVisual({
  card,
  inviteUrl,
  className,
  style,
}: {
  card: ShareCardRecord;
  inviteUrl: string;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div className={className} style={{ ...style }}>
      <ShareCardKeyframes />
      <ShareCardBody card={card} inviteUrl={inviteUrl} />
    </div>
  );
}
