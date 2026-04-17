# SecurePool — Share Card DESIGN TEMPLATES (Add to Ultimate Prompt)

> **APPEND this to the main prompt (cursor-prompt-ultimate-shares-system.md)**
> This provides 5 reference card components with full React + inline styles code.
> Cursor MUST replicate this EXACT design quality for all remaining 17 card types.

---

## PART 9: REFERENCE CARD COMPONENTS (5 Templates)

These 5 cards define the design language. ALL other cards must match this level of polish.
Every card uses:
- **Inline styles only** (for html2canvas)
- **System fonts + emojis** (no external fonts)
- **Fixed 400px width**
- **Animated sparkle particles**
- **Glowing borders and shadows**
- **Gradient text effects**
- **Theme-specific color scheme**

### SHARED COMPONENTS (used by all cards)

```jsx
// ─── Sparkle Particle Background ───
// Renders 20-30 small floating dots that fade in/out
// MUST be inside every card as first child after the container div

const Particles = ({ color = "#00e5a0", count = 22 }) => {
  // Generate particles once with useMemo to avoid re-renders
  const particles = React.useMemo(() =>
    Array.from({ length: count }, (_, i) => ({
      id: i,
      left: `${Math.random() * 100}%`,
      top: `${Math.random() * 100}%`,
      size: Math.random() * 3 + 1,
      delay: `${(Math.random() * 5).toFixed(1)}s`,
      duration: `${(Math.random() * 3 + 2).toFixed(1)}s`,
    })), [count]
  );

  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none", zIndex: 0 }}>
      {particles.map((p) => (
        <div
          key={p.id}
          style={{
            position: "absolute",
            left: p.left,
            top: p.top,
            width: p.size,
            height: p.size,
            borderRadius: "50%",
            backgroundColor: color,
            opacity: 0,
            animation: `sparkle ${p.duration} ${p.delay} infinite ease-in-out`,
          }}
        />
      ))}
    </div>
  );
};

// ─── Card Footer (same on every card) ───
const CardFooter = ({ username, playerId }) => (
  <div style={{
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "14px 24px 20px",
    borderTop: "1px solid rgba(255,255,255,0.04)",
  }}>
    <div style={{
      width: 36,
      height: 36,
      borderRadius: 10,
      background: "linear-gradient(135deg, #00e5a0, #0d9488)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      color: "#0a1628",
      fontSize: 16,
      fontWeight: 800,
      fontFamily: "system-ui, sans-serif",
    }}>
      {(username || "U")[0].toUpperCase()}
    </div>
    <div>
      <div style={{ color: "#ffffff", fontSize: 13, fontWeight: 600, fontFamily: "system-ui, sans-serif" }}>
        {username}
      </div>
      <div style={{ color: "#8899aa", fontSize: 10, fontFamily: "system-ui, sans-serif" }}>
        SecurePool player · #{playerId}
      </div>
    </div>
  </div>
);

// ─── Referral CTA Box (same on every card) ───
const ReferralCTA = ({ refLink, themeColor = "#00e5a0" }) => (
  <div style={{
    margin: "0 20px 16px",
    padding: "14px 18px",
    borderRadius: 12,
    background: `linear-gradient(135deg, ${themeColor}0d, ${themeColor}06)`,
    border: `1px solid ${themeColor}18`,
    textAlign: "center",
  }}>
    <div style={{
      color: themeColor,
      fontSize: 12,
      fontWeight: 600,
      marginBottom: 5,
      fontFamily: "system-ui, sans-serif",
    }}>
      Join with my link
    </div>
    <div style={{
      color: "#8899aa",
      fontSize: 10,
      wordBreak: "break-all",
      fontFamily: "system-ui, sans-serif",
      lineHeight: 1.4,
    }}>
      {refLink}
    </div>
  </div>
);

// ─── Card Header (same layout, dynamic colors) ───
const CardHeader = ({ label, labelIcon, themeColor, date }) => (
  <div style={{
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    padding: "18px 24px 0",
  }}>
    <div>
      <div style={{
        color: themeColor,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: 3,
        textTransform: "uppercase",
        fontFamily: "system-ui, sans-serif",
      }}>
        {labelIcon} {label}
      </div>
      <div style={{
        color: "#8899aa",
        fontSize: 12,
        marginTop: 5,
        fontFamily: "system-ui, sans-serif",
      }}>
        {date}
      </div>
    </div>
    <div style={{
      color: "#00e5a0",
      fontSize: 13,
      fontWeight: 800,
      letterSpacing: 1.5,
      fontFamily: "system-ui, sans-serif",
    }}>
      SECUREPOOL
    </div>
  </div>
);

// ─── Global CSS (inject once in the app) ───
// Add this <style> tag once in the parent component or layout:
const ShareCardStyles = () => (
  <style>{`
    @keyframes sparkle {
      0%, 100% { opacity: 0; transform: scale(0.5); }
      50% { opacity: 0.7; transform: scale(1.3); }
    }
    @keyframes pulse {
      0%, 100% { transform: scale(1); }
      50% { transform: scale(1.06); }
    }
    @keyframes shimmer {
      0% { background-position: -200% center; }
      100% { background-position: 200% center; }
    }
  `}</style>
);
```

---

### TEMPLATE 1: POOL WIN CARD 🏆
**This is the most important card — users share wins the most.**

```jsx
const PoolWinCard = ({ 
  username = "Player",
  amount = "100",
  position = 1,
  poolName = "Classic Pool #42",
  drawHash = "a7f3...d92e",
  date = "Apr 18, 2026",
  refLink = "https://securepool.vercel.app/ref/ABC123",
  playerId = "SP001",
}) => {
  const posConfig = {
    1: { label: "1st Place", emoji: "🏆", glow: "rgba(255,215,0,0.5)" },
    2: { label: "2nd Place", emoji: "🥈", glow: "rgba(192,192,192,0.4)" },
    3: { label: "3rd Place", emoji: "🥉", glow: "rgba(205,127,50,0.4)" },
  };
  const pos = posConfig[position] || posConfig[1];

  return (
    <div style={{
      width: 400,
      background: "#0a1628",
      borderRadius: 20,
      overflow: "hidden",
      position: "relative",
      fontFamily: "system-ui, -apple-system, sans-serif",
      border: "1px solid rgba(255,215,0,0.2)",
      boxShadow: `0 0 80px rgba(255,215,0,0.12), 0 4px 30px rgba(0,0,0,0.5)`,
    }}>
      <Particles color="#ffd700" count={28} />

      {/* Gold accent bar */}
      <div style={{
        height: 5,
        background: "linear-gradient(90deg, transparent 0%, #ffd700 30%, #ffffff 50%, #ffd700 70%, transparent 100%)",
        boxShadow: "0 0 15px rgba(255,215,0,0.6)",
      }} />

      <CardHeader label="Winner" labelIcon="🏆" themeColor="#ffd700" date={date} />

      {/* Center content */}
      <div style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "32px 24px 24px",
        position: "relative",
        zIndex: 1,
      }}>
        {/* Trophy circle */}
        <div style={{
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
          animation: "pulse 3s ease-in-out infinite",
        }}>
          {pos.emoji}
        </div>

        {/* Prize amount */}
        <div style={{
          fontSize: 52,
          fontWeight: 900,
          marginTop: 20,
          lineHeight: 1,
          background: "linear-gradient(180deg, #ffd700 0%, #ffaa00 100%)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          letterSpacing: -1,
        }}>
          {amount} USDT
        </div>

        {/* Position label */}
        <div style={{
          color: "#ffd700",
          fontSize: 15,
          fontWeight: 700,
          marginTop: 10,
          letterSpacing: 1,
        }}>
          {pos.label} {pos.emoji}
        </div>

        {/* Username */}
        <div style={{
          color: "#ffffff",
          fontSize: 24,
          fontWeight: 700,
          marginTop: 20,
          letterSpacing: 0.5,
        }}>
          {username}
        </div>

        {/* Pool name pill */}
        <div style={{
          marginTop: 10,
          padding: "6px 18px",
          borderRadius: 20,
          background: "#111d33",
          border: "1px solid rgba(255,255,255,0.06)",
          color: "#8899aa",
          fontSize: 12,
          fontWeight: 500,
        }}>
          {poolName}
        </div>

        {/* Draw hash - trust proof */}
        <div style={{
          marginTop: 10,
          color: "#556677",
          fontSize: 10,
          letterSpacing: 0.5,
        }}>
          Draw: {drawHash} • Provably Fair
        </div>

        {/* Tagline */}
        <div style={{
          color: "#8899aa",
          fontSize: 12,
          marginTop: 14,
          textAlign: "center",
        }}>
          Won big on SecurePool! Your turn next? 🎯
        </div>
      </div>

      <ReferralCTA refLink={refLink} themeColor="#ffd700" />
      <CardFooter username={username} playerId={playerId} />
    </div>
  );
};
```

---

### TEMPLATE 2: FIRST WIN CARD ✨ (Extra special — rainbow + more particles)

```jsx
const FirstWinCard = ({
  username = "Player",
  amount = "50",
  poolName = "Standard Pool #18",
  date = "Apr 18, 2026",
  refLink = "https://securepool.vercel.app/ref/ABC123",
  playerId = "SP001",
}) => (
  <div style={{
    width: 400,
    background: "#0a1628",
    borderRadius: 20,
    overflow: "hidden",
    position: "relative",
    fontFamily: "system-ui, -apple-system, sans-serif",
    border: "1px solid rgba(255,215,0,0.25)",
    boxShadow: "0 0 100px rgba(255,215,0,0.15), 0 0 60px rgba(168,85,247,0.1), 0 4px 30px rgba(0,0,0,0.5)",
  }}>
    <Particles color="#ffd700" count={20} />
    <Particles color="#a855f7" count={10} />
    <Particles color="#00e5a0" count={8} />

    {/* Rainbow accent bar */}
    <div style={{
      height: 6,
      background: "linear-gradient(90deg, #ff6432, #ffd700, #00e5a0, #3b82f6, #a855f7, #ec4899, #ff6432)",
      backgroundSize: "200% 100%",
      animation: "shimmer 3s linear infinite",
    }} />

    <CardHeader label="First Win" labelIcon="✨" themeColor="#ffd700" date={date} />

    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      padding: "28px 24px 24px",
      position: "relative",
      zIndex: 1,
    }}>
      {/* Extra large star with multi-color glow */}
      <div style={{
        width: 120,
        height: 120,
        borderRadius: "50%",
        background: "radial-gradient(circle at 30% 30%, rgba(255,215,0,0.4), rgba(168,85,247,0.15), rgba(0,229,160,0.1))",
        border: "2px solid rgba(255,215,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 58,
        boxShadow: "0 0 60px rgba(255,215,0,0.35), 0 0 30px rgba(168,85,247,0.2)",
        animation: "pulse 2s ease-in-out infinite",
      }}>
        🌟
      </div>

      {/* FIRST WIN text */}
      <div style={{
        fontSize: 36,
        fontWeight: 900,
        marginTop: 20,
        lineHeight: 1,
        background: "linear-gradient(135deg, #ffd700 0%, #ff6432 30%, #a855f7 60%, #00e5a0 100%)",
        backgroundSize: "200% 200%",
        WebkitBackgroundClip: "text",
        WebkitTextFillColor: "transparent",
        animation: "shimmer 4s linear infinite",
        letterSpacing: 2,
      }}>
        FIRST WIN!
      </div>

      {/* Amount + pool */}
      <div style={{
        fontSize: 28,
        fontWeight: 800,
        marginTop: 14,
        color: "#ffd700",
      }}>
        {amount} USDT
      </div>

      <div style={{
        marginTop: 8,
        color: "#8899aa",
        fontSize: 13,
      }}>
        {poolName}
      </div>

      {/* Username */}
      <div style={{
        color: "#ffffff",
        fontSize: 24,
        fontWeight: 700,
        marginTop: 20,
      }}>
        {username}
      </div>

      {/* Celebration text */}
      <div style={{
        marginTop: 14,
        padding: "8px 20px",
        borderRadius: 20,
        background: "linear-gradient(135deg, rgba(255,215,0,0.1), rgba(168,85,247,0.08))",
        border: "1px solid rgba(255,215,0,0.15)",
        color: "#ffd700",
        fontSize: 13,
        fontWeight: 600,
        textAlign: "center",
      }}>
        Every winner started with their first! 🎉
      </div>
    </div>

    <ReferralCTA refLink={refLink} themeColor="#ffd700" />
    <CardFooter username={username} playerId={playerId} />
  </div>
);
```

---

### TEMPLATE 3: GAME WIN CARD 🎮

```jsx
const GameWinCard = ({
  username = "Player",
  gameName = "Risk Wheel",
  winAmount = "15",
  betAmount = "5",
  multiplier = 3,
  date = "Apr 18, 2026",
  refLink = "https://securepool.vercel.app/ref/ABC123",
  playerId = "SP001",
}) => {
  const gameConfig = {
    "Risk Wheel":     { emoji: "🎡", color: "#00e5a0", gradient: "linear-gradient(135deg, #00e5a0, #0d9488)" },
    "Treasure Hunt":  { emoji: "💎", color: "#a855f7", gradient: "linear-gradient(135deg, #a855f7, #7c3aed)" },
    "Lucky Numbers":  { emoji: "🔢", color: "#ffd700", gradient: "linear-gradient(135deg, #ffd700, #f59e0b)" },
    "Hi-Lo Cards":    { emoji: "🃏", color: "#3b82f6", gradient: "linear-gradient(135deg, #3b82f6, #2563eb)" },
    "Mega Draw":      { emoji: "🎰", color: "#ec4899", gradient: "linear-gradient(135deg, #ec4899, #db2777)" },
  };
  const game = gameConfig[gameName] || gameConfig["Risk Wheel"];

  return (
    <div style={{
      width: 400,
      background: "#0a1628",
      borderRadius: 20,
      overflow: "hidden",
      position: "relative",
      fontFamily: "system-ui, -apple-system, sans-serif",
      border: `1px solid ${game.color}25`,
      boxShadow: `0 0 60px ${game.color}15, 0 4px 30px rgba(0,0,0,0.5)`,
    }}>
      <Particles color={game.color} count={22} />

      {/* Accent bar */}
      <div style={{
        height: 5,
        background: `linear-gradient(90deg, transparent, ${game.color}, transparent)`,
        boxShadow: `0 0 12px ${game.color}88`,
      }} />

      <CardHeader label={gameName} labelIcon="🎮" themeColor={game.color} date={date} />

      <div style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "32px 24px 24px",
        position: "relative",
        zIndex: 1,
      }}>
        {/* Game icon */}
        <div style={{
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
          animation: "pulse 3s ease-in-out infinite",
        }}>
          {game.emoji}
        </div>

        {/* Win amount */}
        <div style={{
          fontSize: 48,
          fontWeight: 900,
          marginTop: 20,
          lineHeight: 1,
          background: `linear-gradient(180deg, ${game.color}, ${game.color}bb)`,
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
        }}>
          +{winAmount} USDT
        </div>

        {/* Multiplier badge */}
        {multiplier > 1 && (
          <div style={{
            marginTop: 10,
            padding: "5px 16px",
            borderRadius: 20,
            background: `${game.color}15`,
            border: `1px solid ${game.color}30`,
            color: game.color,
            fontSize: 14,
            fontWeight: 700,
          }}>
            {multiplier}x Multiplier 🚀
          </div>
        )}

        {/* Bet info */}
        <div style={{
          marginTop: 10,
          color: "#8899aa",
          fontSize: 12,
        }}>
          Bet {betAmount} USDT → Won {winAmount} USDT
        </div>

        {/* Username */}
        <div style={{
          color: "#ffffff",
          fontSize: 24,
          fontWeight: 700,
          marginTop: 20,
        }}>
          {username}
        </div>

        {/* Game name pill */}
        <div style={{
          marginTop: 10,
          padding: "6px 18px",
          borderRadius: 20,
          background: "#111d33",
          border: "1px solid rgba(255,255,255,0.06)",
          color: "#8899aa",
          fontSize: 12,
        }}>
          Won on {gameName} {game.emoji}
        </div>

        <div style={{ color: "#8899aa", fontSize: 12, marginTop: 14, textAlign: "center" }}>
          Winning on SecurePool games! 🎮
        </div>
      </div>

      <ReferralCTA refLink={refLink} themeColor={game.color} />
      <CardFooter username={username} playerId={playerId} />
    </div>
  );
};
```

---

### TEMPLATE 4: WITHDRAWAL SUCCESS CARD 💸
**#1 trust builder — proves the platform actually pays**

```jsx
const WithdrawalCard = ({
  username = "Player",
  amount = "52",
  method = "TRC20 Wallet",
  processTime = "< 5 minutes",
  date = "Apr 18, 2026",
  refLink = "https://securepool.vercel.app/ref/ABC123",
  playerId = "SP001",
}) => (
  <div style={{
    width: 400,
    background: "#0a1628",
    borderRadius: 20,
    overflow: "hidden",
    position: "relative",
    fontFamily: "system-ui, -apple-system, sans-serif",
    border: "1px solid rgba(34,197,94,0.2)",
    boxShadow: "0 0 60px rgba(34,197,94,0.1), 0 4px 30px rgba(0,0,0,0.5)",
  }}>
    <Particles color="#22c55e" count={22} />

    <div style={{
      height: 5,
      background: "linear-gradient(90deg, transparent, #22c55e, #10b981, #22c55e, transparent)",
      boxShadow: "0 0 12px rgba(34,197,94,0.6)",
    }} />

    <CardHeader label="Withdrawal" labelIcon="💸" themeColor="#22c55e" date={date} />

    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      padding: "32px 24px 24px",
      position: "relative",
      zIndex: 1,
    }}>
      {/* Checkmark circle */}
      <div style={{
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
      }}>
        ✅
      </div>

      {/* Amount */}
      <div style={{
        fontSize: 48,
        fontWeight: 900,
        marginTop: 20,
        lineHeight: 1,
        background: "linear-gradient(180deg, #22c55e, #10b981)",
        WebkitBackgroundClip: "text",
        WebkitTextFillColor: "transparent",
      }}>
        {amount} USDT
      </div>

      <div style={{
        color: "#22c55e",
        fontSize: 15,
        fontWeight: 700,
        marginTop: 8,
      }}>
        Withdrawn Successfully ✓
      </div>

      {/* Username */}
      <div style={{
        color: "#ffffff",
        fontSize: 24,
        fontWeight: 700,
        marginTop: 20,
      }}>
        {username}
      </div>

      {/* Method + speed info */}
      <div style={{
        display: "flex",
        gap: 10,
        marginTop: 14,
      }}>
        <div style={{
          padding: "6px 14px",
          borderRadius: 20,
          background: "#111d33",
          border: "1px solid rgba(255,255,255,0.06)",
          color: "#8899aa",
          fontSize: 11,
        }}>
          Via {method}
        </div>
        <div style={{
          padding: "6px 14px",
          borderRadius: 20,
          background: "rgba(34,197,94,0.08)",
          border: "1px solid rgba(34,197,94,0.15)",
          color: "#22c55e",
          fontSize: 11,
          fontWeight: 600,
        }}>
          ⚡ {processTime}
        </div>
      </div>

      <div style={{ color: "#8899aa", fontSize: 12, marginTop: 16, textAlign: "center", lineHeight: 1.5 }}>
        Real money, real withdrawals!<br />SecurePool pays 💸
      </div>
    </div>

    <ReferralCTA refLink={refLink} themeColor="#22c55e" />
    <CardFooter username={username} playerId={playerId} />
  </div>
);
```

---

### TEMPLATE 5: LEVEL UP CARD ⬆️

```jsx
const LevelUpCard = ({
  username = "Player",
  fromLevel = "Bronze",
  toLevel = "Silver",
  date = "Apr 18, 2026",
  refLink = "https://securepool.vercel.app/ref/ABC123",
  playerId = "SP001",
}) => {
  const tierConfig = {
    Rookie:   { color: "#88aacc", icon: "🆕" },
    Bronze:   { color: "#cd7f32", icon: "🥉" },
    Silver:   { color: "#c0c0c0", icon: "🥈" },
    Gold:     { color: "#ffd700", icon: "🥇" },
    Platinum: { color: "#e5e4e2", icon: "💠" },
    Diamond:  { color: "#b9f2ff", icon: "💎" },
  };
  const from = tierConfig[fromLevel] || tierConfig.Bronze;
  const to = tierConfig[toLevel] || tierConfig.Silver;

  return (
    <div style={{
      width: 400,
      background: "#0a1628",
      borderRadius: 20,
      overflow: "hidden",
      position: "relative",
      fontFamily: "system-ui, -apple-system, sans-serif",
      border: `1px solid ${to.color}25`,
      boxShadow: `0 0 60px ${to.color}12, 0 4px 30px rgba(0,0,0,0.5)`,
    }}>
      <Particles color={to.color} count={25} />

      <div style={{
        height: 5,
        background: `linear-gradient(90deg, transparent, ${to.color}, transparent)`,
        boxShadow: `0 0 15px ${to.color}88`,
      }} />

      <CardHeader label="Level Up" labelIcon="⬆️" themeColor={to.color} date={date} />

      <div style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "32px 24px 24px",
        position: "relative",
        zIndex: 1,
      }}>
        {/* Tier badge */}
        <div style={{
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
          animation: "pulse 2.5s ease-in-out infinite",
        }}>
          {to.icon}
        </div>

        {/* Username */}
        <div style={{
          color: "#ffffff",
          fontSize: 26,
          fontWeight: 700,
          marginTop: 20,
          letterSpacing: 0.5,
        }}>
          {username}
        </div>

        {/* Tier transition pill */}
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          marginTop: 16,
          padding: "9px 22px",
          borderRadius: 30,
          background: "rgba(17,29,51,0.9)",
          border: `1px solid ${to.color}18`,
        }}>
          <span style={{ color: from.color, fontSize: 14, fontWeight: 600 }}>
            {from.icon} {fromLevel}
          </span>
          <span style={{
            color: to.color,
            fontSize: 20,
            fontWeight: 300,
          }}>
            →
          </span>
          <span style={{
            color: to.color,
            fontSize: 14,
            fontWeight: 700,
            textShadow: `0 0 12px ${to.color}66`,
          }}>
            {to.icon} {toLevel}
          </span>
        </div>

        <div style={{ color: "#8899aa", fontSize: 12, marginTop: 16, textAlign: "center" }}>
          Climbing the ranks on SecurePool! 🚀
        </div>
      </div>

      <ReferralCTA refLink={refLink} themeColor={to.color} />
      <CardFooter username={username} playerId={playerId} />
    </div>
  );
};
```

---

## INSTRUCTIONS FOR REMAINING 17 CARDS

Cursor: You MUST create the remaining 17 card components following the EXACT same design patterns shown in these 5 templates:

1. **Same component structure:** Container → Particles → Accent bar → CardHeader → Center content → ReferralCTA → CardFooter
2. **Same styling approach:** All inline styles, system fonts, emoji icons
3. **Same visual effects:** Radial gradient icon circles, gradient text for main values, subtle pills for context, glow shadows matching theme color
4. **Same dimensions:** 400px width, ~500-550px height, 20px border-radius
5. **Same spacing:** padding 24px sides, 32px top content area, 20px margins for CTA box
6. **Color patterns:** Each card type has ONE primary theme color. Use it for: accent bar, header label, icon circle border/glow, main value gradient, CTA box tint, pill accents
7. **Particle counts:** Normal cards = 22, Special cards (first_win, mega_jackpot) = 30-40

The remaining 17 cards to build (refer to PART 2 of the main prompt for content specs):
- Pool Streak 🔥 (fire theme)
- Multi-Ticket 🎟️ (cyan theme)
- Pool Milestone 🎯 (teal theme)
- Mega Jackpot 💰 (gold premium theme — extra glow like first_win)
- Game Streak 🕹️ (blue theme)
- Game Milestone 🎮 (purple theme)
- Big Multiplier 🚀 (red-gold theme)
- Deposit Milestone 💰 (blue theme)
- Referral Earned 🤝 (purple theme)
- Referral Milestone 👥 (purple-cyan theme)
- SPT Milestone 🪙 (gold theme)
- SPT Leaderboard 🏅 (gold-cyan theme)
- Staking Started 🔒 (teal theme)
- Staking Reward 💎 (teal-gold theme)
- Login Streak 🔥 (fire theme — same as pool streak style)
- Achievement Unlocked ⭐ (gold-pink theme)
- Review 💬 (cyan theme)

---

## PROMPT END — STOP COPYING HERE ↑
