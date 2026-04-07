import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiUrl, readApiErrorMessage } from "@/lib/api-base";
import { getCsrfToken, setCsrfToken } from "@/lib/csrf";

type SquadPayload = {
  squad: { id: number; name: string; code: string; leaderId: number } | null;
  members?: { userId: number; name: string; totalWins: number }[];
  squadWins?: number;
};

export function SquadPanel() {
  const [data, setData] = useState<SquadPayload | null>(null);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const r = await fetch(apiUrl("/api/squad/my-squad"), { credentials: "include" });
    const j = await r.json();
    setData(j);
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function postJson(url: string, body: object) {
    setBusy(true);
    try {
      const csrfRes = await fetch(apiUrl("/api/auth/csrf-token"), { credentials: "include" });
      const csrfData = await csrfRes.json().catch(() => ({}));
      const token = (csrfData as { csrfToken?: string }).csrfToken ?? getCsrfToken();
      setCsrfToken(token ?? null);
      const res = await fetch(apiUrl(url), {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { "x-csrf-token": token } : {}),
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) alert(await readApiErrorMessage(res));
      else await refresh();
    } finally {
      setBusy(false);
    }
  }

  if (!data) return <p className="text-xs text-muted-foreground">Loading squad…</p>;

  if (!data.squad) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Squad</CardTitle>
          <p className="text-xs text-muted-foreground font-normal">
            Team up with friends — bonus points when squad mates join the same pool or win.
          </p>
        </CardHeader>
        <CardContent className="space-y-3 pt-0">
          <div className="flex gap-2">
            <Input placeholder="Squad name" value={name} onChange={(e) => setName(e.target.value)} />
            <Button disabled={busy} size="sm" onClick={() => void postJson("/api/squad/create", { name })}>
              Create
            </Button>
          </div>
          <div className="flex gap-2">
            <Input placeholder="8-char code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
            <Button disabled={busy} size="sm" variant="secondary" onClick={() => void postJson("/api/squad/join", { code })}>
              Join
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{data.squad.name}</CardTitle>
        <p className="text-xs font-mono text-muted-foreground">Code: {data.squad.code}</p>
      </CardHeader>
      <CardContent className="space-y-2 pt-0">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full"
          onClick={() => void navigator.clipboard.writeText(data.squad!.code)}
        >
          Copy invite code
        </Button>
        <p className="text-xs text-muted-foreground">Combined wins (profile): {data.squadWins ?? 0}</p>
        <ul className="space-y-1">
          {data.members?.map((m) => (
            <li key={m.userId} className="flex items-center justify-between text-sm">
              <span>{m.name}</span>
              <span className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">{m.totalWins} wins</span>
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
