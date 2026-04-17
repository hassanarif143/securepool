import { type CSSProperties, type ReactNode, useMemo } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "gold" | "danger";
type ButtonSize = "sm" | "md" | "lg";

export function ButtonPremium({
  variant = "primary",
  size = "md",
  loading,
  children,
  style,
  disabled,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}) {
  const styles: Record<ButtonVariant, CSSProperties> = {
    primary: {
      background: "linear-gradient(135deg, var(--cyan), var(--teal))",
      color: "#060B18",
      border: "none",
      boxShadow: "0 2px 12px rgba(0,212,255,0.25)",
    },
    secondary: {
      background: "transparent",
      color: "#B0C4D8",
      border: "1px solid var(--border-soft)",
    },
    ghost: {
      background: "transparent",
      color: "var(--text-secondary)",
      border: "none",
    },
    gold: {
      background: "linear-gradient(135deg, var(--gold), #FF9F43)",
      color: "#060B18",
      border: "none",
      boxShadow: "0 2px 12px rgba(255,209,102,0.25)",
    },
    danger: {
      background: "rgba(239,68,68,0.1)",
      color: "#EF4444",
      border: "1px solid rgba(239,68,68,0.25)",
    },
  };

  const sizes: Record<ButtonSize, CSSProperties> = {
    sm: { padding: "6px 14px", fontSize: "12px", borderRadius: "8px" },
    md: { padding: "10px 20px", fontSize: "14px", borderRadius: "10px" },
    lg: { padding: "13px 28px", fontSize: "15px", borderRadius: "12px" },
  };

  const isDisabled = Boolean(loading || disabled);

  return (
    <button
      disabled={isDisabled}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "7px",
        fontFamily: '"Syne", sans-serif',
        fontWeight: 700,
        cursor: isDisabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        transition: "all 0.18s ease",
        ...styles[variant],
        ...sizes[size],
        ...(style ?? {}),
      }}
      {...props}
    >
      {loading ? (
        <span
          aria-hidden
          style={{
            width: "14px",
            height: "14px",
            borderRadius: "50%",
            border: "2px solid currentColor",
            borderTopColor: "transparent",
            animation: "spin 0.7s linear infinite",
            display: "inline-block",
          }}
        />
      ) : null}
      {children}
    </button>
  );
}

export function CardPremium({
  children,
  glow,
  gold,
  hover = true,
  style,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  glow?: boolean;
  gold?: boolean;
  hover?: boolean;
}) {
  return (
    <div
      style={{
        background: "var(--bg-surface)",
        border: `1px solid ${
          gold ? "var(--border-gold)" : glow ? "var(--border-cyan)" : "var(--border-soft)"
        }`,
        borderRadius: "var(--r-lg)",
        padding: "20px",
        boxShadow: gold ? "var(--shadow-gold)" : glow ? "var(--shadow-cyan)" : "var(--shadow-sm)",
        transition: hover ? "all 0.2s ease" : undefined,
        ...(style ?? {}),
      }}
      onMouseEnter={
        hover
          ? (e) => {
              const el = e.currentTarget;
              el.style.borderColor = gold ? "rgba(255,209,102,0.35)" : "rgba(255,255,255,0.10)";
              el.style.transform = "translateY(-2px)";
            }
          : undefined
      }
      onMouseLeave={
        hover
          ? (e) => {
              const el = e.currentTarget;
              el.style.borderColor = gold ? "var(--border-gold)" : "var(--border-soft)";
              el.style.transform = "";
            }
          : undefined
      }
      {...props}
    >
      {children}
    </div>
  );
}

export function BadgePremium({ children, variant = "default" }: { children: ReactNode; variant?: string }) {
  const variants: Record<string, { bg: string; color: string; border: string }> = {
    default: { bg: "rgba(255,255,255,0.06)", color: "var(--text-secondary)", border: "var(--border-soft)" },
    success: { bg: "rgba(16,185,129,0.1)", color: "#10B981", border: "rgba(16,185,129,0.3)" },
    warning: { bg: "rgba(245,158,11,0.1)", color: "#F59E0B", border: "rgba(245,158,11,0.3)" },
    danger: { bg: "rgba(239,68,68,0.1)", color: "#EF4444", border: "rgba(239,68,68,0.3)" },
    gold: { bg: "rgba(255,209,102,0.1)", color: "var(--gold)", border: "rgba(255,209,102,0.3)" },
    cyan: { bg: "rgba(0,212,255,0.1)", color: "var(--cyan)", border: "rgba(0,212,255,0.3)" },
    live: { bg: "rgba(16,185,129,0.1)", color: "#10B981", border: "rgba(16,185,129,0.3)" },
  };
  const v = variants[variant] ?? variants.default;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "4px",
        background: v.bg,
        color: v.color,
        border: `1px solid ${v.border}`,
        borderRadius: "var(--r-full)",
        padding: "2px 10px",
        fontSize: "11px",
        fontWeight: 700,
        letterSpacing: "0.3px",
        fontFamily: '"DM Sans", sans-serif',
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

export function StatCardPremium({
  icon,
  label,
  value,
  sub,
  color = "var(--text-primary)",
  href,
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  color?: string;
  href?: string;
}) {
  const card = (
    <div
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border-soft)",
        borderRadius: "var(--r-lg)",
        padding: "16px",
        transition: "all 0.18s ease",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "rgba(255,255,255,0.10)";
        e.currentTarget.style.transform = "translateY(-2px)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "var(--border-soft)";
        e.currentTarget.style.transform = "";
      }}
    >
      <div style={{ fontSize: "20px", marginBottom: "10px" }}>{icon}</div>
      <div
        style={{
          fontFamily: '"Syne", sans-serif',
          fontWeight: 800,
          fontSize: "24px",
          color,
          lineHeight: 1,
          marginBottom: "4px",
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontSize: "11px",
          color: "var(--text-muted)",
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.5px",
        }}
      >
        {label}
      </div>
      {sub ? <div style={{ fontSize: "10px", color: "var(--text-faint)", marginTop: "3px" }}>{sub}</div> : null}
    </div>
  );
  return href ? (
    <a href={href} style={{ textDecoration: "none" }}>
      {card}
    </a>
  ) : (
    card
  );
}

export function SectionHeaderPremium({ title, action, actionHref }: { title: string; action?: string; actionHref?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
      <div
        style={{
          fontSize: "11px",
          fontWeight: 700,
          color: "var(--text-muted)",
          letterSpacing: "1.5px",
          textTransform: "uppercase",
          fontFamily: '"Syne", sans-serif',
        }}
      >
        {title}
      </div>
      {action && actionHref ? (
        <a
          href={actionHref}
          style={{ fontSize: "12px", color: "var(--cyan)", fontWeight: 600, textDecoration: "none" }}
        >
          {action} →
        </a>
      ) : null}
    </div>
  );
}

export function EmptyStatePremium({
  icon,
  title,
  sub,
  actionLabel,
  actionHref,
}: {
  icon: ReactNode;
  title: string;
  sub?: string;
  actionLabel?: string;
  actionHref?: string;
}) {
  return (
    <div
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border-soft)",
        borderRadius: "var(--r-lg)",
        padding: "40px 20px",
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: "40px", marginBottom: "12px" }}>{icon}</div>
      <div style={{ fontSize: "15px", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "6px" }}>
        {title}
      </div>
      {sub ? <div style={{ fontSize: "13px", color: "var(--text-muted)", marginBottom: "16px" }}>{sub}</div> : null}
      {actionLabel && actionHref ? (
        <a
          href={actionHref}
          style={{
            display: "inline-block",
            padding: "9px 20px",
            background: "var(--cyan-dim)",
            border: "1px solid var(--border-cyan)",
            borderRadius: "var(--r-full)",
            color: "var(--cyan)",
            fontSize: "13px",
            fontWeight: 600,
            textDecoration: "none",
          }}
        >
          {actionLabel}
        </a>
      ) : null}
    </div>
  );
}

export function LoadingSpinnerPremium({ size = 20, color = "var(--cyan)" }: { size?: number; color?: string }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        border: `2px solid ${String(color)}33`,
        borderTopColor: String(color),
        animation: "spin 0.7s linear infinite",
        flexShrink: 0,
      }}
    />
  );
}

export function ProgressBarPremium({
  value,
  max,
  color = "linear-gradient(90deg, var(--cyan), var(--teal))",
  height = 5,
}: {
  value: number;
  max: number;
  color?: string;
  height?: number;
}) {
  const pct = useMemo(() => {
    const safeMax = max > 0 ? max : 1;
    return Math.min(100, Math.round((value / safeMax) * 100));
  }, [value, max]);
  return (
    <div style={{ height, background: "var(--border-soft)", borderRadius: 99, overflow: "hidden" }}>
      <div
        style={{
          width: `${pct}%`,
          height: "100%",
          borderRadius: 99,
          background: color,
          transition: "width 1.2s cubic-bezier(0.4,0,0.2,1)",
        }}
      />
    </div>
  );
}

