import type { CSSProperties } from "react";

export type ShareCardRecord = {
  id: number;
  cardType: string;
  cardData: Record<string, unknown>;
  referralCode: string | null;
  shareCount: number;
  createdAt: string;
};

const BG = "#0a0f1a";
const ACCENTS: Record<string, { bar: string; glow: string }> = {
  pool_win: { bar: "linear-gradient(90deg,#f59e0b,#fbbf24)", glow: "rgba(245,158,11,0.15)" },
  referral_earned: { bar: "linear-gradient(90deg,#15803d,#22c55e)", glow: "rgba(34,197,94,0.15)" },
  withdrawal_success: { bar: "linear-gradient(90deg,#10b981,#34d399)", glow: "rgba(16,185,129,0.15)" },
  achievement_unlocked: { bar: "linear-gradient(90deg,#ec4899,#f59e0b)", glow: "rgba(236,72,153,0.12)" },
  level_up: { bar: "linear-gradient(90deg,#22c55e,#15803d)", glow: "rgba(34,197,94,0.12)" },
  login_streak: { bar: "linear-gradient(90deg,#ef4444,#fbbf24)", glow: "rgba(239,68,68,0.12)" },
  pool_streak: { bar: "linear-gradient(90deg,#f97316,#fbbf24)", glow: "rgba(249,115,22,0.12)" },
  default: { bar: "linear-gradient(90deg,#22c55e,#4ade80)", glow: "rgba(34,197,94,0.12)" },
};

function pickAccent(type: string) {
  return ACCENTS[type] ?? ACCENTS.default;
}

export function buildShareMessage(card: ShareCardRecord, inviteUrl: string): string {
  const d = card.cardData;
  const amt = String(d.amount ?? "");
  switch (card.cardType) {
    case "pool_win":
      return `I just won $${amt} USDT on SecurePool! 🏆 Provably fair draws — verify it yourself. Try your luck → ${inviteUrl}`;
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
  const accent = pickAccent(card.cardType);
  const d = card.cardData;
  const title =
    card.cardType === "pool_win"
      ? "POOL WIN"
      : card.cardType === "referral_earned"
        ? "REFERRAL BONUS"
        : card.cardType === "withdrawal_success"
          ? "WITHDRAWAL"
          : card.cardType.replace(/_/g, " ").toUpperCase();

  return (
    <div
      className={className}
      style={{
        width: 380,
        minHeight: 420,
        background: BG,
        borderRadius: 16,
        overflow: "hidden",
        border: "1px solid rgba(148,163,184,0.15)",
        boxShadow: `0 0 40px ${accent.glow}`,
        fontFamily: "system-ui, sans-serif",
        ...style,
      }}
    >
      <div style={{ height: 6, background: accent.bar }} />
      <div style={{ padding: "18px 20px", position: "relative" }}>
        <div className="flex justify-between items-start gap-2">
          <div>
            <p style={{ fontSize: 11, letterSpacing: "0.12em", color: "#94a3b8", fontWeight: 600 }}>{title}</p>
            <p style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>{String(d.date ?? "")}</p>
          </div>
          <span style={{ fontSize: 11, fontWeight: 700, color: "#4ade80" }}>SECUREPOOL</span>
        </div>

        <div style={{ textAlign: "center", marginTop: 16, marginBottom: 8 }}>
          {card.cardType === "pool_win" ? (
            <span style={{ fontSize: 52 }}>🏆</span>
          ) : card.cardType === "referral_earned" ? (
            <span style={{ fontSize: 52 }}>🤝</span>
          ) : card.cardType === "withdrawal_success" ? (
            <span style={{ fontSize: 52 }}>💸</span>
          ) : card.cardType === "pool_streak" || card.cardType === "login_streak" ? (
            <span style={{ fontSize: 52 }}>🔥</span>
          ) : card.cardType === "level_up" ? (
            <span style={{ fontSize: 52 }}>⬆️</span>
          ) : card.cardType === "achievement_unlocked" ? (
            <span style={{ fontSize: 52 }}>🏅</span>
          ) : (
            <span style={{ fontSize: 52 }}>⭐</span>
          )}
        </div>

        <p style={{ textAlign: "center", color: "#e2e8f0", fontSize: 15, fontWeight: 600 }}>
          {String(d.username ?? "Player")}
        </p>

        {card.cardType === "level_up" && (d.new_level != null || d.previous_level != null) ? (
          <p style={{ textAlign: "center", marginTop: 10, fontSize: 14, color: "#94a3b8" }}>
            {String(d.previous_level ?? "?")} → {String(d.new_level ?? "?")}
          </p>
        ) : null}

        {card.cardType === "achievement_unlocked" && d.achievement_name != null ? (
          <p style={{ textAlign: "center", marginTop: 10, fontSize: 17, fontWeight: 600, color: "#f1f5f9" }}>
            {String(d.achievement_name)}
          </p>
        ) : null}

        {(card.cardType === "login_streak" || card.cardType === "pool_streak") && d.streak_days != null ? (
          <div style={{ textAlign: "center", marginTop: 12 }}>
            <p
              style={{
                fontSize: 36,
                fontWeight: 800,
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                background: accent.bar,
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              {String(d.streak_days)}{" "}
              {String(d.streak_kind ?? "") === "pool_join" ? "pools" : "days"}
            </p>
            <p style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>
              {String(d.streak_kind ?? "") === "pool_join" ? "in a row" : "login streak"}
            </p>
          </div>
        ) : null}

        {"amount" in d && d.amount != null ? (
          <div style={{ textAlign: "center", marginTop: 12 }}>
            <p
              style={{
                fontSize: 32,
                fontWeight: 800,
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                background: accent.bar,
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              ${String(d.amount)} {String(d.currency ?? "USDT")}
            </p>
            {"pkr_equivalent" in d && d.pkr_equivalent != null ? (
              <p style={{ fontSize: 13, color: "#64748b", marginTop: 4 }}>≈ {String(d.pkr_equivalent)} PKR</p>
            ) : null}
          </div>
        ) : null}

        {card.cardType === "pool_win" ? (
          <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 12 }}>
            <div style={{ background: "rgba(30,41,59,0.6)", borderRadius: 8, padding: "8px 10px" }}>
              <p style={{ color: "#64748b", fontSize: 10 }}>Pool</p>
              <p style={{ color: "#e2e8f0", fontWeight: 600 }}>{String(d.pool_name ?? "")}</p>
            </div>
            <div style={{ background: "rgba(30,41,59,0.6)", borderRadius: 8, padding: "8px 10px" }}>
              <p style={{ color: "#64748b", fontSize: 10 }}>Place</p>
              <p style={{ color: "#e2e8f0", fontWeight: 600 }}>{String(d.place_label ?? d.place ?? "")}</p>
            </div>
          </div>
        ) : null}

        {"draw_hash" in d && d.draw_hash ? (
          <p style={{ fontSize: 11, color: "#64748b", marginTop: 14, textAlign: "center", fontFamily: "monospace" }}>
            🔒 Provably fair — {String(d.draw_hash)}
          </p>
        ) : null}

        <div
          style={{
            marginTop: 18,
            padding: "12px 14px",
            borderRadius: 10,
            background: "rgba(34,197,94,0.08)",
            border: "1px solid rgba(34,197,94,0.2)",
          }}
        >
          <p style={{ fontSize: 12, color: "#94a3b8", textAlign: "center" }}>Join with my link</p>
          <p style={{ fontSize: 11, color: "#4ade80", textAlign: "center", wordBreak: "break-all", marginTop: 4 }}>
            {inviteUrl}
          </p>
        </div>

        <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              background: "linear-gradient(135deg,#22c55e,#15803d)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 800,
              color: "#fff",
              fontSize: 14,
            }}
          >
            {(String(d.username ?? "?")[0] ?? "?").toUpperCase()}
          </div>
          <div>
            <p style={{ fontSize: 13, fontWeight: 600, color: "#f1f5f9" }}>{String(d.username ?? "")}</p>
            <p style={{ fontSize: 11, color: "#64748b" }}>SecurePool player · #{card.id}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
