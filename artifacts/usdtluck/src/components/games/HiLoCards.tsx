import { useCallback, useState } from "react";
import { idem, postHiloCashout, postHiloGuess, postHiloStart } from "@/lib/games-api";

export type HiLoCardsProps = {
  balance: number;
  allowedBets: number[];
  onBalanceUpdate: (newBalance: number) => void;
  onPlayComplete?: () => void;
};

const LADDER = [1, 1.2, 1.5, 2, 3, 5];

export default function HiLoCards({ balance, allowedBets, onBalanceUpdate, onPlayComplete }: HiLoCardsProps) {
  const [bet, setBet] = useState(allowedBets[0] ?? 1);
  const [gameId, setGameId] = useState<number | null>(null);
  const [cardName, setCardName] = useState<string | null>(null);
  const [mult, setMult] = useState(1);
  const [pot, setPot] = useState(0);
  const [busy, setBusy] = useState(false);
  const [busted, setBusted] = useState(false);

  const bets = [1, 2, 5].filter((b) => allowedBets.includes(b));

  const deal = useCallback(async () => {
    if (busy || balance < bet) return;
    setBusy(true);
    setBusted(false);
    try {
      const r = await postHiloStart(bet, idem());
      setGameId(r.gameId as number);
      setCardName(r.cardName as string);
      setMult((r.currentMultiplier as number) ?? 1);
      setPot((r.potentialWin as number) ?? bet);
      onBalanceUpdate((r.newBalance as number) ?? balance);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Deal failed");
    } finally {
      setBusy(false);
    }
  }, [busy, balance, bet, onBalanceUpdate]);

  const guess = useCallback(
    async (g: "higher" | "lower") => {
      if (!gameId || busy) return;
      setBusy(true);
      try {
        const r = await postHiloGuess(gameId, g);
        if (r.busted) {
          setBusted(true);
          setGameId(null);
          onBalanceUpdate((r.newBalance as number) ?? balance);
          onPlayComplete?.();
        } else if (r.cashedOut) {
          setGameId(null);
          onBalanceUpdate((r.newBalance as number) ?? balance);
          onPlayComplete?.();
        } else {
          setCardName((r.cardName as string) ?? "?");
          setMult((r.currentMultiplier as number) ?? 1);
          setPot((r.potentialWin as number) ?? 0);
        }
      } catch (e) {
        window.alert(e instanceof Error ? e.message : "Guess failed");
      } finally {
        setBusy(false);
      }
    },
    [gameId, busy, balance, onBalanceUpdate, onPlayComplete],
  );

  const cash = useCallback(async () => {
    if (!gameId || busy) return;
    setBusy(true);
    try {
      const r = await postHiloCashout(gameId);
      setGameId(null);
      onBalanceUpdate((r.newBalance as number) ?? balance);
      onPlayComplete?.();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Cashout failed");
    } finally {
      setBusy(false);
    }
  }, [gameId, busy, balance, onBalanceUpdate, onPlayComplete]);

  return (
    <div className="relative mx-auto flex w-full max-w-md flex-col items-center gap-4 px-2">
      <h2 className="font-sp-display text-[22px] font-bold text-sp-text">Hi-Lo Cards</h2>
      <div className="flex w-full gap-1">
        {LADDER.map((m) => (
          <div
            key={m}
            className={`h-2 flex-1 rounded-full ${mult >= m ? "bg-[#00E5CC] shadow-[0_0_8px_rgba(0,229,204,0.4)]" : "bg-white/10"}`}
            title={`${m}×`}
          />
        ))}
      </div>

      <div
        className={`relative flex h-[200px] w-[140px] items-center justify-center rounded-2xl border-2 border-white/10 bg-gradient-to-br from-[#1a1a2e] to-[#16213e] shadow-[0_8px_32px_rgba(0,0,0,0.35)] ${busted ? "animate-shake border-red-500/50" : ""}`}
      >
        <span className="font-sp-mono text-5xl font-extrabold text-[#FFD700]">{cardName ?? "—"}</span>
      </div>

      {gameId == null ? (
        <>
          <div className="flex gap-2">
            {bets.map((b) => (
              <button
                key={b}
                type="button"
                onClick={() => setBet(b)}
                className={`rounded-lg px-3 py-1.5 font-mono text-sm ${bet === b ? "bg-[#00E5CC]/20 text-[#00E5CC]" : "bg-white/5"}`}
              >
                {b}
              </button>
            ))}
          </div>
          <button
            type="button"
            disabled={busy || balance < bet}
            onClick={() => void deal()}
            className="rounded-xl bg-emerald-600 px-8 py-3 font-bold text-white disabled:opacity-40"
          >
            DEAL
          </button>
        </>
      ) : (
        <>
          <p className="font-sp-mono text-sm text-sp-text-dim">
            {mult.toFixed(2)}× · Potential {pot.toFixed(2)} USDT
          </p>
          <div className="flex gap-3">
            <button
              type="button"
              disabled={busy}
              onClick={() => void guess("higher")}
              className="rounded-xl bg-emerald-600 px-6 py-3 font-bold text-white"
            >
              HIGHER ↑
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void guess("lower")}
              className="rounded-xl bg-red-600 px-6 py-3 font-bold text-white"
            >
              LOWER ↓
            </button>
          </div>
          <button
            type="button"
            disabled={busy || mult <= 1}
            onClick={() => void cash()}
            className="rounded-xl bg-gradient-to-r from-[#FFD700] to-amber-600 px-6 py-2 text-sm font-bold text-black disabled:opacity-40"
          >
            CASH OUT
          </button>
        </>
      )}
      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-6px); }
          75% { transform: translateX(6px); }
        }
        .animate-shake { animation: shake 0.35s ease-in-out 2; }
      `}</style>
    </div>
  );
}
