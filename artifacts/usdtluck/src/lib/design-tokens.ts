export const designTokens = {
  colors: {
    withdrawable: "#16A34A",
    rewards: "#2563EB",
    warning: "#F59E0B",
    danger: "#DC2626",
    surface: "#111827",
    border: "#1F2937",
    textPrimary: "#F9FAFB",
    textSecondary: "#9CA3AF",
  },
  radius: {
    card: 16,
    button: 12,
    modal: 20,
  },
  spacing: {
    xs: 8,
    sm: 12,
    md: 16,
    lg: 24,
    xl: 32,
    xxl: 48,
  },
} as const;

export type DesignTokens = typeof designTokens;
