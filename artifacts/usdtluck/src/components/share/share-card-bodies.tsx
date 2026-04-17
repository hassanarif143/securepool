import type { CSSProperties, ReactNode } from "react";
import type { ShareCardRecord } from "@/components/share/share-card-types";
import {
  CardFooter,
  CardHeader,
  Particles,
  ReferralCTA,
  SHARE_BRAND_GREEN,
  SHARE_CARD_BG,
} from "@/components/share/share-card-primitives";

const CARD_WIDTH = 400;

function shell(style: CSSProperties, children: ReactNode) {
  return (
    <div
      style={{
        width: CARD_WIDTH,
        background: SHARE_CARD_BG,
        borderRadius: 20,
        overflow: "hidden",
        position: "relative",
        fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function placeToPosition(place: unknown): 1 | 2 | 3 {
  const s = String(place ?? "").toLowerCase();
  if (s.includes("2") && (s.includes("2nd") || s.includes("second") || s.startsWith("2"))) return 2;
  if (s.includes("3") && (s.includes("3rd") || s.includes("third") || s.startsWith("3"))) return 3;
  return 1;
}

function shortHash(h: unknown): string {
  const s = String(h ?? "");
  if (s.length <= 14) return s;
  return `${s.slice(0, 6)}...${s.slice(-4)}`;
}

const TIER: Record<string, { color: string; icon: string }> = {
  rookie: { color: "#88aacc", icon: "🆕" },
  bronze: { color: "#cd7f32", icon: "🥉" },
  silver: { color: "#c0c0c0", icon: "🥈" },
  gold: { color: "#ffd700", icon: "🥇" },
  platinum: { color: "#e5e4e2", icon: "💠" },
  diamond: { color: "#b9f2ff", icon: "💎" },
};

function tierMeta(label: unknown) {
  const k = String(label ?? "bronze").toLowerCase();
  return TIER[k] ?? { color: "#cd7f32", icon: "🥉" };
}

const GAME_META: Record<string, { emoji: string; color: string }> = {
  "Risk Wheel": { emoji: "🎡", color: "#00c2a8" },
  "Treasure Hunt": { emoji: "💎", color: "#22c55e" },
  "Lucky Numbers": { emoji: "🔢", color: "#ffd700" },
  "Hi-Lo Cards": { emoji: "🃏", color: "#3b82f6" },
  "Mega Draw": { emoji: "🎰", color: "#f472b6" },
};

function gameMeta(name: unknown) {
  const s = String(name ?? "Risk Wheel");
  return GAME_META[s] ?? { emoji: "🎮", color: "#00c2a8" };
}

/** Pool win — Template 1 */
function BodyPoolWin({ d, inviteUrl, playerId, seed }: { d: Record<string, unknown>; inviteUrl: string; playerId: string; seed: number }) {
  const position = placeToPosition(d.place);
  const posConfig: Record<number, { label: string; emoji: string; glow: string }> = {
    1: { label: "1st Place", emoji: "🏆", glow: "rgba(255,215,0,0.5)" },
    2: { label: "2nd Place", emoji: "🥈", glow: "rgba(192,192,192,0.4)" },
    3: { label: "3rd Place", emoji: "🥉", glow: "rgba(205,127,50,0.4)" },
  };
  const pos = posConfig[position] ?? posConfig[1];
  const username = String(d.username ?? "Player");
  const amount = String(d.amount ?? "0");
  const poolName = String(d.pool_name ?? "Pool");
  const drawHash = shortHash(d.draw_hash);
  const date = String(d.date ?? "");

  return shell(
    {
      border: "1px solid rgba(255,215,0,0.2)",
      boxShadow: "0 0 80px rgba(255,215,0,0.12), 0 4px 30px rgba(0,0,0,0.5)",
    },
    <>
      <Particles color="#ffd700" count={28} seed={seed} />
      <div
        style={{
          height: 5,
          background: "linear-gradient(90deg, transparent 0%, #ffd700 30%, #ffffff 50%, #ffd700 70%, transparent 100%)",
          boxShadow: "0 0 15px rgba(255,215,0,0.6)",
          position: "relative",
          zIndex: 1,
        }}
      />
      <CardHeader label="Winner" labelIcon="🏆" themeColor="#ffd700" date={date} />
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          padding: "32px 24px 24px",
          position: "relative",
          zIndex: 1,
        }}
      >
        <div
          style={{
            width: 110,
            height: 110,
            borderRadius: "50%",
            background: "radial-gradient(circle at 35% 35%, rgba(255,215,0,0.35), rgba(255,215,0,0.08))",
            border: "2px solid rgba(255,215,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 52,
            boxShadow: `0 0 50px ${pos.glow}, inset 0 0 30px rgba(255,215,0,0.1)`,
            animation: "sp-share-pulse 3s ease-in-out infinite",
          }}
        >
          {pos.emoji}
        </div>
        <div
          style={{
            fontSize: 52,
            fontWeight: 900,
            marginTop: 20,
            lineHeight: 1,
            background: "linear-gradient(180deg, #ffd700 0%, #ffaa00 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
            letterSpacing: -1,
          }}
        >
          {amount} USDT
        </div>
        <div style={{ color: "#ffd700", fontSize: 15, fontWeight: 700, marginTop: 10, letterSpacing: 1 }}>
          {pos.label} {pos.emoji}
        </div>
        <div style={{ color: "#ffffff", fontSize: 24, fontWeight: 700, marginTop: 20, letterSpacing: 0.5 }}>{username}</div>
        <div
          style={{
            marginTop: 10,
            padding: "6px 18px",
            borderRadius: 20,
            background: "#111d33",
            border: "1px solid rgba(255,255,255,0.06)",
            color: "#8899aa",
            fontSize: 12,
            fontWeight: 500,
          }}
        >
          {poolName}
        </div>
        <div style={{ marginTop: 10, color: "#556677", fontSize: 10, letterSpacing: 0.5 }}>
          Draw: {drawHash} • Provably Fair
        </div>
        <div style={{ color: "#8899aa", fontSize: 12, marginTop: 14, textAlign: "center" }}>Won big on SecurePool! Your turn next? 🎯</div>
      </div>
      <ReferralCTA refLink={inviteUrl} themeColor="#ffd700" />
      <CardFooter username={username} playerId={playerId} />
    </>,
  );
}

/** First win — Template 2 (future / optional card type) */
function BodyFirstWin({ d, inviteUrl, playerId, seed }: { d: Record<string, unknown>; inviteUrl: string; playerId: string; seed: number }) {
  const username = String(d.username ?? "Player");
  const amount = String(d.amount ?? "0");
  const poolName = String(d.pool_name ?? "Pool");
  const date = String(d.date ?? "");
  return shell(
    {
      border: "1px solid rgba(255,215,0,0.25)",
      boxShadow: "0 0 100px rgba(255,215,0,0.15), 0 0 60px rgba(168,85,247,0.1), 0 4px 30px rgba(0,0,0,0.5)",
    },
    <>
      <Particles color="#ffd700" count={20} seed={seed} />
      <Particles color="#a855f7" count={10} seed={seed + 3} />
      <Particles color="#00c2a8" count={8} seed={seed + 7} />
      <div
        style={{
          height: 6,
          background: "linear-gradient(90deg, #ff6432, #ffd700, #00c2a8, #3b82f6, #a855f7, #ec4899, #ff6432)",
          backgroundSize: "200% 100%",
          animation: "sp-share-shimmer 3s linear infinite",
          position: "relative",
          zIndex: 1,
        }}
      />
      <CardHeader label="First Win" labelIcon="✨" themeColor="#ffd700" date={date} />
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          padding: "28px 24px 24px",
          position: "relative",
          zIndex: 1,
        }}
      >
        <div
          style={{
            width: 120,
            height: 120,
            borderRadius: "50%",
            background: "radial-gradient(circle at 30% 30%, rgba(255,215,0,0.4), rgba(168,85,247,0.15), rgba(0,194,168,0.1))",
            border: "2px solid rgba(255,215,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 58,
            boxShadow: "0 0 60px rgba(255,215,0,0.35), 0 0 30px rgba(168,85,247,0.2)",
            animation: "sp-share-pulse 2s ease-in-out infinite",
          }}
        >
          🌟
        </div>
        <div
          style={{
            fontSize: 36,
            fontWeight: 900,
            marginTop: 20,
            lineHeight: 1,
            background: "linear-gradient(135deg, #ffd700 0%, #ff6432 30%, #a855f7 60%, #00c2a8 100%)",
            backgroundSize: "200% 200%",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
            animation: "sp-share-shimmer 4s linear infinite",
            letterSpacing: 2,
          }}
        >
          FIRST WIN!
        </div>
        <div style={{ fontSize: 28, fontWeight: 800, marginTop: 14, color: "#ffd700" }}>{amount} USDT</div>
        <div style={{ marginTop: 8, color: "#8899aa", fontSize: 13 }}>{poolName}</div>
        <div style={{ color: "#ffffff", fontSize: 24, fontWeight: 700, marginTop: 20 }}>{username}</div>
        <div
          style={{
            marginTop: 14,
            padding: "8px 20px",
            borderRadius: 20,
            background: "linear-gradient(135deg, rgba(255,215,0,0.1), rgba(168,85,247,0.08))",
            border: "1px solid rgba(255,215,0,0.15)",
            color: "#ffd700",
            fontSize: 13,
            fontWeight: 600,
            textAlign: "center",
          }}
        >
          Every winner started with their first! 🎉
        </div>
      </div>
      <ReferralCTA refLink={inviteUrl} themeColor="#ffd700" />
      <CardFooter username={username} playerId={playerId} />
    </>,
  );
}

/** Game win — Template 3 */
function BodyGameWin({ d, inviteUrl, playerId, seed }: { d: Record<string, unknown>; inviteUrl: string; playerId: string; seed: number }) {
  const gameName = String(d.game_name ?? "Risk Wheel");
  const game = gameMeta(gameName);
  const username = String(d.username ?? "Player");
  const winAmount = String(d.win_amount ?? d.amount ?? "0");
  const betAmount = String(d.bet_amount ?? "0");
  const multiplier = Number(d.multiplier ?? 1);
  const date = String(d.date ?? "");

  return shell(
    {
      border: `1px solid ${game.color}25`,
      boxShadow: `0 0 60px ${game.color}15, 0 4px 30px rgba(0,0,0,0.5)`,
    },
    <>
      <Particles color={game.color} count={22} seed={seed} />
      <div
        style={{
          height: 5,
          background: `linear-gradient(90deg, transparent, ${game.color}, transparent)`,
          boxShadow: `0 0 12px ${game.color}88`,
          position: "relative",
          zIndex: 1,
        }}
      />
      <CardHeader label={gameName} labelIcon="🎮" themeColor={game.color} date={date} />
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          padding: "32px 24px 24px",
          position: "relative",
          zIndex: 1,
        }}
      >
        <div
          style={{
            width: 100,
            height: 100,
            borderRadius: "50%",
            background: `radial-gradient(circle at 35% 35%, ${game.color}40, ${game.color}10)`,
            border: `2px solid ${game.color}55`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 48,
            boxShadow: `0 0 40px ${game.color}30`,
            animation: "sp-share-pulse 3s ease-in-out infinite",
          }}
        >
          {game.emoji}
        </div>
        <div
          style={{
            fontSize: 48,
            fontWeight: 900,
            marginTop: 20,
            lineHeight: 1,
            background: `linear-gradient(180deg, ${game.color}, ${game.color}bb)`,
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
          }}
        >
          +{winAmount} USDT
        </div>
        {multiplier > 1 ? (
          <div
            style={{
              marginTop: 10,
              padding: "5px 16px",
              borderRadius: 20,
              background: `${game.color}15`,
              border: `1px solid ${game.color}30`,
              color: game.color,
              fontSize: 14,
              fontWeight: 700,
            }}
          >
            {multiplier}x Multiplier 🚀
          </div>
        ) : null}
        <div style={{ marginTop: 10, color: "#8899aa", fontSize: 12 }}>
          Bet {betAmount} USDT → Won {winAmount} USDT
        </div>
        <div style={{ color: "#ffffff", fontSize: 24, fontWeight: 700, marginTop: 20 }}>{username}</div>
        <div
          style={{
            marginTop: 10,
            padding: "6px 18px",
            borderRadius: 20,
            background: "#111d33",
            border: "1px solid rgba(255,255,255,0.06)",
            color: "#8899aa",
            fontSize: 12,
          }}
        >
          Won on {gameName} {game.emoji}
        </div>
        <div style={{ color: "#8899aa", fontSize: 12, marginTop: 14, textAlign: "center" }}>Winning on SecurePool games! 🎮</div>
      </div>
      <ReferralCTA refLink={inviteUrl} themeColor={game.color} />
      <CardFooter username={username} playerId={playerId} />
    </>,
  );
}

/** Withdrawal — Template 4 */
function BodyWithdrawal({ d, inviteUrl, playerId, seed }: { d: Record<string, unknown>; inviteUrl: string; playerId: string; seed: number }) {
  const username = String(d.username ?? "Player");
  const amount = String(d.amount ?? "0");
  const method = String(d.withdrawal_method ?? "TRC20 Wallet");
  const processTime = String(d.processing_time ?? "< 5 minutes");
  const date = String(d.date ?? "");
  const green = "#22c55e";

  return shell(
    {
      border: "1px solid rgba(34,197,94,0.2)",
      boxShadow: "0 0 60px rgba(34,197,94,0.1), 0 4px 30px rgba(0,0,0,0.5)",
    },
    <>
      <Particles color={green} count={22} seed={seed} />
      <div
        style={{
          height: 5,
          background: "linear-gradient(90deg, transparent, #22c55e, #10b981, #22c55e, transparent)",
          boxShadow: "0 0 12px rgba(34,197,94,0.6)",
          position: "relative",
          zIndex: 1,
        }}
      />
      <CardHeader label="Withdrawal" labelIcon="💸" themeColor={green} date={date} />
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          padding: "32px 24px 24px",
          position: "relative",
          zIndex: 1,
        }}
      >
        <div
          style={{
            width: 100,
            height: 100,
            borderRadius: "50%",
            background: "radial-gradient(circle at 35% 35%, rgba(34,197,94,0.35), rgba(34,197,94,0.08))",
            border: "2px solid rgba(34,197,94,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 48,
            boxShadow: "0 0 45px rgba(34,197,94,0.3)",
          }}
        >
          ✅
        </div>
        <div
          style={{
            fontSize: 48,
            fontWeight: 900,
            marginTop: 20,
            lineHeight: 1,
            background: "linear-gradient(180deg, #22c55e, #10b981)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
          }}
        >
          {amount} USDT
        </div>
        <div style={{ color: green, fontSize: 15, fontWeight: 700, marginTop: 8 }}>Withdrawn Successfully ✓</div>
        <div style={{ color: "#ffffff", fontSize: 24, fontWeight: 700, marginTop: 20 }}>{username}</div>
        <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
          <div
            style={{
              padding: "6px 14px",
              borderRadius: 20,
              background: "#111d33",
              border: "1px solid rgba(255,255,255,0.06)",
              color: "#8899aa",
              fontSize: 11,
            }}
          >
            Via {method}
          </div>
          <div
            style={{
              padding: "6px 14px",
              borderRadius: 20,
              background: "rgba(34,197,94,0.08)",
              border: "1px solid rgba(34,197,94,0.15)",
              color: green,
              fontSize: 11,
              fontWeight: 600,
            }}
          >
            ⚡ {processTime}
          </div>
        </div>
        <div style={{ color: "#8899aa", fontSize: 12, marginTop: 16, textAlign: "center", lineHeight: 1.5 }}>
          Real money, real withdrawals!
          <br />
          SecurePool pays 💸
        </div>
      </div>
      <ReferralCTA refLink={inviteUrl} themeColor={green} />
      <CardFooter username={username} playerId={playerId} />
    </>,
  );
}

/** Level up — Template 5 */
function BodyLevelUp({ d, inviteUrl, playerId, seed }: { d: Record<string, unknown>; inviteUrl: string; playerId: string; seed: number }) {
  const username = String(d.username ?? "Player");
  const fromLevel = String(d.previous_level ?? "Bronze");
  const toLevel = String(d.new_level ?? "Silver");
  const from = tierMeta(fromLevel);
  const to = tierMeta(toLevel);
  const date = String(d.date ?? "");

  return shell(
    {
      border: `1px solid ${to.color}25`,
      boxShadow: `0 0 60px ${to.color}12, 0 4px 30px rgba(0,0,0,0.5)`,
    },
    <>
      <Particles color={to.color} count={25} seed={seed} />
      <div
        style={{
          height: 5,
          background: `linear-gradient(90deg, transparent, ${to.color}, transparent)`,
          boxShadow: `0 0 15px ${to.color}88`,
          position: "relative",
          zIndex: 1,
        }}
      />
      <CardHeader label="Level Up" labelIcon="⬆️" themeColor={to.color} date={date} />
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          padding: "32px 24px 24px",
          position: "relative",
          zIndex: 1,
        }}
      >
        <div
          style={{
            width: 105,
            height: 105,
            borderRadius: "50%",
            background: `radial-gradient(circle at 30% 30%, ${to.color}40, ${to.color}0d)`,
            border: `2px solid ${to.color}66`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 50,
            boxShadow: `0 0 45px ${to.color}30`,
            animation: "sp-share-pulse 2.5s ease-in-out infinite",
          }}
        >
          {to.icon}
        </div>
        <div style={{ color: "#ffffff", fontSize: 26, fontWeight: 700, marginTop: 20, letterSpacing: 0.5 }}>{username}</div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            marginTop: 16,
            padding: "9px 22px",
            borderRadius: 30,
            background: "rgba(17,29,51,0.9)",
            border: `1px solid ${to.color}18`,
          }}
        >
          <span style={{ color: from.color, fontSize: 14, fontWeight: 600 }}>
            {from.icon} {fromLevel}
          </span>
          <span style={{ color: to.color, fontSize: 20, fontWeight: 300 }}>→</span>
          <span style={{ color: to.color, fontSize: 14, fontWeight: 700, textShadow: `0 0 12px ${to.color}66` }}>
            {to.icon} {toLevel}
          </span>
        </div>
        <div style={{ color: "#8899aa", fontSize: 12, marginTop: 16, textAlign: "center" }}>Climbing the ranks on SecurePool! 🚀</div>
      </div>
      <ReferralCTA refLink={inviteUrl} themeColor={to.color} />
      <CardFooter username={username} playerId={playerId} />
    </>,
  );
}

/** Referral earned — purple accent, same structure */
function BodyReferralEarned({ d, inviteUrl, playerId, seed }: { d: Record<string, unknown>; inviteUrl: string; playerId: string; seed: number }) {
  const username = String(d.username ?? "Player");
  const amount = String(d.amount ?? "0");
  const friend = String(d.friend_username ?? "Friend");
  const totalRefs = String(d.total_referrals ?? "0");
  const date = String(d.date ?? "");
  const c = "#a855f7";

  return shell(
    { border: `1px solid ${c}30`, boxShadow: `0 0 50px ${c}18, 0 4px 30px rgba(0,0,0,0.5)` },
    <>
      <Particles color={c} count={22} seed={seed} />
      <div style={{ height: 5, background: `linear-gradient(90deg, transparent, ${c}, transparent)`, boxShadow: `0 0 12px ${c}66`, position: "relative", zIndex: 1 }} />
      <CardHeader label="Referral" labelIcon="🤝" themeColor={c} date={date} />
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "32px 24px 20px", position: "relative", zIndex: 1 }}>
        <div
          style={{
            width: 100,
            height: 100,
            borderRadius: "50%",
            background: `radial-gradient(circle at 35% 35%, ${c}35, ${c}08)`,
            border: `2px solid ${c}55`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 48,
            animation: "sp-share-pulse 3s ease-in-out infinite",
          }}
        >
          🤝
        </div>
        <div
          style={{
            fontSize: 40,
            fontWeight: 900,
            marginTop: 18,
            background: `linear-gradient(180deg, ${c}, #7c3aed)`,
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
          }}
        >
          +{amount} USDT
        </div>
        <p style={{ color: "#8899aa", fontSize: 12, marginTop: 10, textAlign: "center" }}>
          From inviting <span style={{ color: "#e2e8f0", fontWeight: 600 }}>{friend}</span>
        </p>
        <p style={{ color: "#64748b", fontSize: 11, marginTop: 6 }}>{totalRefs} successful referrals total</p>
      </div>
      <ReferralCTA refLink={inviteUrl} themeColor={c} />
      <CardFooter username={username} playerId={playerId} />
    </>,
  );
}

/** Fire streak — login + pool */
function BodyStreak({
  d,
  inviteUrl,
  playerId,
  seed,
  kind,
}: {
  d: Record<string, unknown>;
  inviteUrl: string;
  playerId: string;
  seed: number;
  kind: "login" | "pool";
}) {
  const username = String(d.username ?? "Player");
  const n = String(d.streak_days ?? "");
  const date = String(d.date ?? "");
  const c = "#f97316";
  const label = kind === "pool" ? "Pool streak" : "Login streak";
  const sub = kind === "pool" ? "pools in a row" : "day streak";

  return shell(
    { border: `1px solid ${c}35`, boxShadow: `0 0 55px ${c}20, 0 4px 30px rgba(0,0,0,0.5)` },
    <>
      <Particles color={c} count={26} seed={seed} />
      <Particles color="#fbbf24" count={12} seed={seed + 1} />
      <div style={{ height: 5, background: `linear-gradient(90deg, transparent, ${c}, #fbbf24, transparent)`, position: "relative", zIndex: 1 }} />
      <CardHeader label={label} labelIcon="🔥" themeColor={c} date={date} />
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "28px 24px 24px", position: "relative", zIndex: 1 }}>
        <div style={{ fontSize: 56 }}>🔥</div>
        <div
          style={{
            fontSize: 42,
            fontWeight: 900,
            marginTop: 12,
            background: "linear-gradient(180deg, #fbbf24, #f97316)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
          }}
        >
          {n} {kind === "pool" ? "pools" : "days"}
        </div>
        <p style={{ color: "#8899aa", fontSize: 13, marginTop: 8 }}>{sub}</p>
        <p style={{ color: "#ffffff", fontSize: 22, fontWeight: 700, marginTop: 16 }}>{username}</p>
      </div>
      <ReferralCTA refLink={inviteUrl} themeColor={c} />
      <CardFooter username={username} playerId={playerId} />
    </>,
  );
}

/** Achievement */
function BodyAchievement({ d, inviteUrl, playerId, seed }: { d: Record<string, unknown>; inviteUrl: string; playerId: string; seed: number }) {
  const username = String(d.username ?? "Player");
  const name = String(d.achievement_name ?? "Achievement");
  const amount = d.amount != null ? String(d.amount) : null;
  const date = String(d.date ?? "");
  const gold = "#ffd700";
  const pink = "#f472b6";

  return shell(
    { border: `1px solid ${gold}28`, boxShadow: `0 0 60px rgba(255,215,0,0.12), 0 4px 30px rgba(0,0,0,0.5)` },
    <>
      <Particles color={gold} count={22} seed={seed} />
      <Particles color={pink} count={10} seed={seed + 2} />
      <div
        style={{
          height: 5,
          background: `linear-gradient(90deg, transparent, ${gold}, ${pink}, transparent)`,
          position: "relative",
          zIndex: 1,
        }}
      />
      <CardHeader label="Achievement" labelIcon="⭐" themeColor={gold} date={date} />
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "28px 24px 24px", position: "relative", zIndex: 1 }}>
        <div style={{ fontSize: 52 }}>🏅</div>
        <p style={{ color: "#ffffff", fontSize: 18, fontWeight: 700, marginTop: 14, textAlign: "center", padding: "0 12px" }}>{name}</p>
        {amount ? (
          <p style={{ fontSize: 28, fontWeight: 800, marginTop: 10, color: gold }}>+{amount} USDT</p>
        ) : null}
        <p style={{ color: "#ffffff", fontSize: 22, fontWeight: 600, marginTop: 14 }}>{username}</p>
      </div>
      <ReferralCTA refLink={inviteUrl} themeColor={gold} />
      <CardFooter username={username} playerId={playerId} />
    </>,
  );
}

/** Fallback */
function BodyGeneric({ card, inviteUrl, playerId, seed }: { card: ShareCardRecord; inviteUrl: string; playerId: string; seed: number }) {
  const d = card.cardData;
  const username = String(d.username ?? "Player");
  const date = String(d.date ?? "");
  const title = card.cardType.replace(/_/g, " ").toUpperCase();

  return shell(
    { border: "1px solid rgba(148,163,184,0.2)", boxShadow: `0 0 50px rgba(34,197,94,0.1), 0 4px 30px rgba(0,0,0,0.5)` },
    <>
      <Particles color={SHARE_BRAND_GREEN} count={22} seed={seed} />
      <div
        style={{
          height: 5,
          background: `linear-gradient(90deg, transparent, ${SHARE_BRAND_GREEN}, transparent)`,
          position: "relative",
          zIndex: 1,
        }}
      />
      <CardHeader label={title} labelIcon="⭐" themeColor={SHARE_BRAND_GREEN} date={date} />
      <div style={{ padding: "28px 24px 24px", position: "relative", zIndex: 1, textAlign: "center" }}>
        <div style={{ fontSize: 48 }}>✨</div>
        <p style={{ color: "#e2e8f0", fontSize: 16, fontWeight: 600, marginTop: 12 }}>{username}</p>
        {"amount" in d && d.amount != null ? (
          <p
            style={{
              fontSize: 30,
              fontWeight: 800,
              marginTop: 12,
              background: `linear-gradient(180deg, ${SHARE_BRAND_GREEN}, #22c55e)`,
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            ${String(d.amount)} {String(d.currency ?? "USDT")}
          </p>
        ) : null}
      </div>
      <ReferralCTA refLink={inviteUrl} themeColor={SHARE_BRAND_GREEN} />
      <CardFooter username={username} playerId={playerId} />
    </>,
  );
}

export function ShareCardBody({
  card,
  inviteUrl,
}: {
  card: ShareCardRecord;
  inviteUrl: string;
}) {
  const d = card.cardData;
  const playerId = String(card.id);
  const seed = card.id * 7919;

  switch (card.cardType) {
    case "pool_win":
      return <BodyPoolWin d={d} inviteUrl={inviteUrl} playerId={playerId} seed={seed} />;
    case "first_win":
      return <BodyFirstWin d={d} inviteUrl={inviteUrl} playerId={playerId} seed={seed} />;
    case "game_win":
      return <BodyGameWin d={d} inviteUrl={inviteUrl} playerId={playerId} seed={seed} />;
    case "withdrawal_success":
      return <BodyWithdrawal d={d} inviteUrl={inviteUrl} playerId={playerId} seed={seed} />;
    case "level_up":
      return <BodyLevelUp d={d} inviteUrl={inviteUrl} playerId={playerId} seed={seed} />;
    case "referral_earned":
      return <BodyReferralEarned d={d} inviteUrl={inviteUrl} playerId={playerId} seed={seed} />;
    case "login_streak":
      return <BodyStreak d={d} inviteUrl={inviteUrl} playerId={playerId} seed={seed} kind="login" />;
    case "pool_streak":
      return <BodyStreak d={d} inviteUrl={inviteUrl} playerId={playerId} seed={seed} kind="pool" />;
    case "achievement_unlocked":
      return <BodyAchievement d={d} inviteUrl={inviteUrl} playerId={playerId} seed={seed} />;
    default:
      return <BodyGeneric card={card} inviteUrl={inviteUrl} playerId={playerId} seed={seed} />;
  }
}
