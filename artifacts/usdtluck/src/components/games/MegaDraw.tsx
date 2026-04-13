import { useCallback, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { fetchMegaDrawCurrent, fetchMegaDrawResults, idem, postMegaDrawBuy } from "@/lib/games-api";
import { useSound } from "@/hooks/useSound";
import { cn } from "@/lib/utils";

export type MegaDrawProps = {
  balance: number;
  onBalanceUpdate: (n: number) => void;
};

export default function MegaDraw({ balance, onBalanceUpdate }: MegaDrawProps) {
  const { play } = useSound();
  const [digits, setDigits] = useState(["", "", "", ""]);
  const [cart, setCart] = useState<string[]>([]);
  const [lookupInput, setLookupInput] = useState("");
  const [submittedRoundId, setSubmittedRoundId] = useState<number | null>(null);

  const q = useQuery({
    queryKey: ["mega-draw-current"],
    queryFn: fetchMegaDrawCurrent,
    refetchInterval: 30_000,
  });

  const resultsQ = useQuery({
    queryKey: ["mega-draw-results", submittedRoundId],
    queryFn: () => fetchMegaDrawResults(submittedRoundId!),
    enabled: submittedRoundId != null && submittedRoundId > 0,
  });

  const round = q.data?.round;

  const displayJackpot = round?.displayJackpot ?? 0;

  const addToCart = useCallback(() => {
    const n = digits.map((d) => d || "0").join("");
    if (!/^[0-9]{4}$/.test(n)) return;
    play("tap");
    setCart((c) => [...c, n]);
  }, [digits]);

  const buy = useCallback(async () => {
    if (cart.length === 0) return;
    try {
      play("tap");
      const r = await postMegaDrawBuy(cart, idem());
      onBalanceUpdate(r.newBalance);
      setCart([]);
      play("cashout");
      await q.refetch();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Purchase failed");
    }
  }, [cart, onBalanceUpdate, q]);

  const drawAt = useMemo(() => {
    if (!round?.drawAt) return "—";
    const d = new Date(round.drawAt);
    return d.toLocaleString();
  }, [round?.drawAt]);

  const loadResults = useCallback(() => {
    const id = parseInt(lookupInput.trim(), 10);
    if (!Number.isFinite(id) || id < 1) {
      window.alert("Enter a valid round number (database id).");
      return;
    }
    play("tap");
    setSubmittedRoundId(id);
  }, [lookupInput]);

  const viewCurrentRound = useCallback(() => {
    if (round?.id != null) setSubmittedRoundId(round.id);
  }, [round?.id]);

  const res = resultsQ.data;

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-6 px-2 py-4">
      <div className="relative overflow-hidden rounded-3xl border border-[#FFD700]/30 bg-gradient-to-br from-amber-950/50 to-sp-deep p-6 text-center shadow-[0_0_40px_rgba(255,215,0,0.12)]">
        <div className="pointer-events-none absolute inset-0 opacity-60" style={{ background: "radial-gradient(circle at 25% 20%, rgba(255,215,0,0.18), transparent 55%), radial-gradient(circle at 80% 35%, rgba(0,229,204,0.10), transparent 60%)" }} />
        <p className="text-xs font-bold uppercase tracking-[0.3em] text-amber-200/80">Mega Draw</p>
        <p className="relative mt-2 font-sp-mono text-5xl font-extrabold tabular-nums text-[#FFD700] drop-shadow-[0_0_24px_rgba(255,215,0,0.35)]">
          {displayJackpot.toFixed(2)} <span className="text-lg text-amber-100/80">USDT</span>
        </p>
        <p className="mt-2 text-xs text-sp-text-dim">Next draw (server): {drawAt}</p>
        <p className="mt-1 font-mono text-xs text-sp-text-dim">
          Open round id <span className="text-white">{round?.id ?? "—"}</span> · Tickets sold: {round?.totalTickets ?? 0} / {round?.capTickets ?? 200}
        </p>
        {round?.id != null ? (
          <button
            type="button"
            onClick={viewCurrentRound}
            className="mt-3 text-xs font-semibold text-[#00E5CC] underline-offset-2 hover:underline"
          >
            View this round&apos;s results
          </button>
        ) : null}
      </div>

      <div className="sp-glass rounded-2xl p-4">
        <p className="mb-3 text-sm font-semibold text-sp-text">Pick a 4-digit number (0–9 each)</p>
        <div className="mb-3 flex justify-center gap-2">
          {digits.map((d, i) => (
            <input
              key={i}
              maxLength={1}
              value={d}
              inputMode="numeric"
              onChange={(e) => {
                const v = e.target.value.replace(/\D/g, "").slice(-1);
                if (v) play("number-pop", { intensity: 0.25 });
                setDigits((prev) => {
                  const n = [...prev];
                  n[i] = v;
                  return n;
                });
              }}
              className="h-14 w-12 rounded-2xl border border-white/15 bg-black/30 text-center font-sp-mono text-2xl font-extrabold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
            />
          ))}
        </div>
        <button
          type="button"
          onClick={addToCart}
          className="w-full rounded-2xl border border-white/10 bg-white/[0.06] py-2.5 text-sm font-semibold text-white/90 hover:bg-white/[0.08]"
        >
          Add ticket ({digits.map((d) => d || "0").join("")})
        </button>
        {cart.length > 0 ? (
          <ul className="mt-3 space-y-1 text-sm text-sp-text-dim">
            {cart.map((c, i) => (
              <li key={i} className="flex justify-between font-mono">
                <span>{c}</span>
                <button
                  type="button"
                  className="text-red-400 hover:text-red-300"
                  onClick={() => {
                    play("tap");
                    setCart((x) => x.filter((_, j) => j !== i));
                  }}
                >
                  remove
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <button
          type="button"
          disabled={cart.length === 0 || balance < cart.length * 2}
          onClick={() => void buy()}
          className={cn(
            "mt-4 w-full rounded-2xl bg-gradient-to-r from-[#FFD700] to-amber-600 py-3 font-extrabold text-black",
            "shadow-[0_14px_44px_rgba(255,215,0,0.12)] disabled:opacity-40",
          )}
        >
          Buy {cart.length} ticket(s) — {(cart.length * 2).toFixed(2)} USDT
        </button>
        <p className="mt-2 text-center text-xs text-sp-text-dim">Withdrawable balance: {balance.toFixed(2)} USDT</p>
      </div>

      <div>
        <p className="mb-2 text-xs font-bold uppercase tracking-wider text-sp-text-dim">My tickets (this round)</p>
        <div className="flex flex-wrap gap-2">
          {(q.data?.myTickets ?? []).map((t) => (
            <span key={t.id} className="rounded-lg border border-white/10 bg-black/25 px-3 py-1 font-mono text-sm">
              {t.ticketNumber}
            </span>
          ))}
        </div>
      </div>

      <div className="sp-glass rounded-2xl p-4">
        <p className="mb-2 text-sm font-semibold text-sp-text">Round results</p>
        <p className="mb-3 text-xs text-sp-text-dim">Load any round by its database id (see “Open round id” above for the current one).</p>
        <div className="flex flex-wrap gap-2">
          <input
            value={lookupInput}
            onChange={(e) => setLookupInput(e.target.value.replace(/\D/g, ""))}
            placeholder="Round id"
            className="min-w-[120px] flex-1 rounded-lg border border-white/15 bg-black/30 px-3 py-2 font-mono text-sm"
          />
          <button
            type="button"
            onClick={loadResults}
            className="rounded-lg bg-white/10 px-4 py-2 text-sm font-semibold"
          >
            Load
          </button>
        </div>
        {resultsQ.isLoading ? <p className="mt-3 text-xs text-sp-text-dim">Loading…</p> : null}
        {resultsQ.isError ? (
          <p className="mt-3 text-xs text-red-400">{resultsQ.error instanceof Error ? resultsQ.error.message : "Could not load"}</p>
        ) : null}
        {res?.round ? (
          <div className="mt-4 space-y-2 text-sm">
            <p className="font-mono text-sp-text">
              Round #{res.round.roundNumber} · <span className="text-sp-text-dim">{res.round.status}</span>
            </p>
            {res.round.winningNumber != null ? (
              <p>
                Winning number:{" "}
                <span className="font-mono font-bold text-[#FFD700]">{res.round.winningNumber}</span>
              </p>
            ) : (
              <p className="text-sp-text-dim">Not drawn yet.</p>
            )}
            <p className="text-xs text-sp-text-dim">
              Pool {res.round.totalPool.toFixed(2)} USDT · Paid out {res.round.totalPaidOut.toFixed(2)} USDT
            </p>
            <p className="text-xs text-sp-text-dim">
              Winners: 4-match {res.matchCounts.match4} · 3 {res.matchCounts.match3} · 2 {res.matchCounts.match2} · 1{" "}
              {res.matchCounts.match1} · 0 {res.matchCounts.match0}
            </p>
            {res.myTickets.length > 0 ? (
              <div className="mt-2 border-t border-white/10 pt-2">
                <p className="mb-1 text-xs font-bold uppercase text-sp-text-dim">Your tickets</p>
                <ul className="space-y-1 font-mono text-xs">
                  {res.myTickets.map((t) => (
                    <li key={t.id} className="flex justify-between gap-2">
                      <span>{t.ticketNumber}</span>
                      <span className="text-sp-text-dim">
                        {t.matchCount != null ? `${t.matchCount}/4` : "—"} · {t.winAmount.toFixed(2)} USDT
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <AnimatePresence>
        {q.isFetching ? (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            className="fixed bottom-6 left-1/2 z-[999] -translate-x-1/2 rounded-full border border-white/10 bg-black/60 px-3 py-1.5 text-xs text-white/80 backdrop-blur-xl"
          >
            Updating jackpot…
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
