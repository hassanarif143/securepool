import { useEffect, useState } from "react";
import { apiUrl } from "@/lib/api-base";

export function PointsExpiryWarning() {
  const [exp, setExp] = useState<{
    expiringIn7d: number;
    expiringIn3d: number;
    expiringIn1d: number;
    nextExpiryDate: string | null;
  } | null>(null);

  useEffect(() => {
    fetch(apiUrl("/api/user/loyalty"), { credentials: "include" })
      .then((r) => r.json())
      .then((d: { points_expiring?: typeof exp }) => {
        if (d.points_expiring) setExp(d.points_expiring);
      })
      .catch(() => {});
  }, []);

  if (!exp || (exp.expiringIn7d <= 0 && exp.expiringIn3d <= 0 && exp.expiringIn1d <= 0)) return null;

  const urgent = exp.expiringIn1d > 0;
  const warn = exp.expiringIn3d > 0 && !urgent;

  return (
    <div
      className={`rounded-xl px-4 py-3 text-sm ${urgent ? "border-red-500/40 bg-red-500/10" : warn ? "border-amber-500/40 bg-amber-500/10" : "border-border bg-muted/30"}`}
      style={{ borderWidth: 1, borderStyle: "solid" }}
    >
      <p className="font-semibold mb-1">
        {urgent && "Last day — points expiring tomorrow"}
        {!urgent && warn && "Points expiring in 3 days"}
        {!urgent && !warn && "Points expiring within 7 days"}
      </p>
      <p className="text-xs text-muted-foreground">
        Tracked referral points expire 30 days after earning. You have {exp.expiringIn7d} pt(s) in the window.
        {exp.nextExpiryDate && ` Next expiry: ${new Date(exp.nextExpiryDate).toLocaleDateString()}.`}
      </p>
    </div>
  );
}
