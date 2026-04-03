import { useEffect, useState } from "react";
import { apiUrl } from "@/lib/api-base";

type Avail = {
  type: string;
  title: string;
  description: string;
  icon: string;
  earned: boolean;
  progressHint: string | null;
};

export function AchievementGrid() {
  const [available, setAvailable] = useState<Avail[]>([]);

  useEffect(() => {
    void fetch(apiUrl("/api/user/achievements"), { credentials: "include" })
      .then((r) => r.json())
      .then((j) => setAvailable(Array.isArray(j.available) ? j.available : []))
      .catch(() => {});
  }, []);

  if (available.length === 0) return null;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
      {available.map((a) => (
        <div
          key={a.type}
          className={`rounded-xl border p-3 text-center ${
            a.earned ? "border-primary/40 bg-primary/10" : "border-border opacity-70 grayscale"
          }`}
        >
          <div className="text-2xl mb-1">{a.earned ? a.icon : "🔒"}</div>
          <p className="text-xs font-semibold leading-tight">{a.earned ? a.title : "???"}</p>
          {!a.earned && a.progressHint && (
            <p className="text-[10px] text-muted-foreground mt-1">{a.progressHint}</p>
          )}
        </div>
      ))}
    </div>
  );
}
