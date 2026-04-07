type CelebrationLayerProps = {
  level: "small" | "medium" | "large";
  message?: string;
};

const styles: Record<CelebrationLayerProps["level"], string> = {
  small: "border-emerald-500/40 bg-emerald-500/10",
  medium: "border-blue-500/40 bg-blue-500/10",
  large: "border-fuchsia-500/40 bg-fuchsia-500/10",
};

export function CelebrationLayer({ level, message }: CelebrationLayerProps) {
  return (
    <div className={`rounded-2xl border p-4 ${styles[level]}`}>
      <p className="text-sm font-semibold capitalize">{level} celebration</p>
      <p className="text-xs text-muted-foreground mt-1">
        {message ?? "Hook this component to reward, milestone, and winner events."}
      </p>
    </div>
  );
}
