import { useCallback, useEffect, useRef, useState } from "react";
import { arcadePlay, type ArcadePlaySuccess } from "@/lib/games-play-ui";
import { fireConfetti } from "./confetti";

export type ScratchCardProps = {
  balance: number;
  allowedBets: number[];
  onBalanceUpdate: (newBalance: number) => void;
  onPlayComplete?: () => void;
};

export default function ScratchCard({ balance, allowedBets, onBalanceUpdate, onPlayComplete }: ScratchCardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const resultRef = useRef<ArcadePlaySuccess | null>(null);
  /** Sync lock — `betDeducted` state updates async; without this, rapid strokes can call `arcadePlay` twice. */
  const roundLockRef = useRef(false);
  const [currentBet, setCurrentBet] = useState(allowedBets[0] ?? 1);
  const [betDeducted, setBetDeducted] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [progress, setProgress] = useState(0);
  const [isScratching, setIsScratching] = useState(false);
  const [pendingApi, setPendingApi] = useState(false);
  const [serverResult, setServerResult] = useState<ArcadePlaySuccess | null>(null);

  const bets = [1, 2, 5].filter((b) => allowedBets.includes(b));

  useEffect(() => {
    setCurrentBet((prev) => (allowedBets.includes(prev) ? prev : allowedBets[0] ?? 1));
  }, [allowedBets]);

  const initCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = 280;
    canvas.height = 180;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    grad.addColorStop(0, "#1a2332");
    grad.addColorStop(0.5, "#0f1923");
    grad.addColorStop(1, "#1a2332");
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = "rgba(0,229,204,0.04)";
    for (let i = 0; i < 20; i++) {
      ctx.beginPath();
      ctx.arc(
        Math.random() * canvas.width,
        Math.random() * canvas.height,
        Math.random() * 20 + 5,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }

    ctx.fillStyle = "rgba(255,255,255,0.15)";
    ctx.font = "600 16px Outfit, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("SCRATCH HERE", canvas.width / 2, canvas.height / 2 + 6);

    canvas.style.display = "block";
    roundLockRef.current = false;
    setBetDeducted(false);
    setRevealed(false);
    setProgress(0);
    resultRef.current = null;
    setServerResult(null);
    setPendingApi(false);
  }, []);

  useEffect(() => {
    initCanvas();
  }, [initCanvas]);

  const handleScratch = useCallback(
    async (x: number, y: number) => {
      if (revealed) return;
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx) return;

      if (!betDeducted && !roundLockRef.current) {
        if (balance < currentBet) {
          window.alert("Insufficient balance!");
          return;
        }
        roundLockRef.current = true;
        setBetDeducted(true);
        setPendingApi(true);
        const response = await arcadePlay("scratch_card", currentBet);
        setPendingApi(false);
        if (!response.success) {
          roundLockRef.current = false;
          setBetDeducted(false);
          window.alert(response.error || "Something went wrong");
          return;
        }
        resultRef.current = response;
        setServerResult(response);
      }

      ctx.globalCompositeOperation = "destination-out";
      ctx.beginPath();
      ctx.arc(x, y, 22, 0, Math.PI * 2);
      ctx.fill();

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      let transparent = 0;
      const total = imageData.data.length / 4;
      for (let i = 3; i < imageData.data.length; i += 4) {
        if (imageData.data[i] === 0) transparent++;
      }
      const pct = (transparent / total) * 100;
      setProgress(pct);

      if (pct > 50 && !revealed) {
        setRevealed(true);
        canvas.style.display = "none";
        const res = resultRef.current;
        if (res) {
          onBalanceUpdate(res.newBalance);
          onPlayComplete?.();
          if (res.resultType !== "loss") {
            fireConfetti(res.resultType === "big_win");
          }
        }
      }
    },
    [revealed, betDeducted, balance, currentBet, onBalanceUpdate, onPlayComplete],
  );

  const getPos = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const r = canvasRef.current?.getBoundingClientRect();
    if (!r) return { x: 0, y: 0 };
    const scaleX = canvasRef.current!.width / r.width;
    const scaleY = canvasRef.current!.height / r.height;
    return { x: (e.clientX - r.left) * scaleX, y: (e.clientY - r.top) * scaleY };
  };

  const getTouchPos = (e: React.TouchEvent<HTMLCanvasElement>) => {
    const r = canvasRef.current?.getBoundingClientRect();
    if (!r) return { x: 0, y: 0 };
    const t = e.touches[0];
    const scaleX = canvasRef.current!.width / r.width;
    const scaleY = canvasRef.current!.height / r.height;
    return { x: (t.clientX - r.left) * scaleX, y: (t.clientY - r.top) * scaleY };
  };

  const r = serverResult;
  const rewardEmoji =
    r?.resultType === "big_win" ? "🏆" : r?.resultType === "small_win" ? "✨" : "😔";
  const rewardText = r?.resultType === "loss" ? "Try Again" : r ? `+${r.winAmount.toFixed(2)}` : "—";
  const rewardColor =
    r?.resultType === "big_win"
      ? "text-[#FFD700]"
      : r?.resultType === "small_win"
        ? "text-[#00E5CC]"
        : "text-[#FF4757]";

  return (
    <div className="flex flex-col items-center">
      <h2 className="font-sp-display text-[22px] font-bold text-sp-text">Scratch &amp; Win</h2>
      <p className="mb-1 text-xs text-sp-text-dim">Scratch to reveal your prize</p>

      <div className="my-3">
        <div className="mb-2.5 text-center text-xs uppercase tracking-[1.5px] text-sp-text-dim">Select Bet</div>
        <div className="flex flex-wrap justify-center gap-2">
          {bets.map((bet) => (
            <button
              key={bet}
              type="button"
              onClick={() => !betDeducted && setCurrentBet(bet)}
              disabled={betDeducted}
              className={`rounded-[10px] px-5 py-2.5 font-sp-mono text-sm font-semibold transition-all duration-200 ${
                currentBet === bet
                  ? "border border-[#00E5CC] bg-[rgba(0,229,204,0.15)] text-[#00E5CC] shadow-[0_0_12px_rgba(0,229,204,0.15)]"
                  : "border border-sp-border bg-[rgba(255,255,255,0.04)] text-sp-text hover:border-[rgba(0,229,204,0.3)]"
              }`}
            >
              {bet}
            </button>
          ))}
        </div>
      </div>

      <div className="relative mx-auto my-4 h-[180px] w-[280px] overflow-hidden rounded-2xl border border-sp-border">
        <div className="absolute inset-0 flex flex-col items-center justify-center rounded-2xl bg-gradient-to-br from-[rgba(255,215,0,0.08)] to-[rgba(255,215,0,0.02)]">
          <div className="mb-2 text-4xl">{betDeducted || revealed ? rewardEmoji : "🎫"}</div>
          <div className={`font-sp-mono text-2xl font-extrabold ${rewardColor}`}>
            {pendingApi ? "…" : betDeducted || revealed ? rewardText : "???"}
          </div>
        </div>

        <canvas
          ref={canvasRef}
          className="absolute inset-0 z-10 cursor-crosshair touch-none rounded-2xl"
          onMouseDown={(e) => {
            setIsScratching(true);
            const p = getPos(e);
            void handleScratch(p.x, p.y);
          }}
          onMouseMove={(e) => {
            if (!isScratching) return;
            const p = getPos(e);
            void handleScratch(p.x, p.y);
          }}
          onMouseUp={() => setIsScratching(false)}
          onMouseLeave={() => setIsScratching(false)}
          onTouchStart={(e) => {
            e.preventDefault();
            setIsScratching(true);
            const p = getTouchPos(e);
            void handleScratch(p.x, p.y);
          }}
          onTouchMove={(e) => {
            e.preventDefault();
            if (!isScratching) return;
            const p = getTouchPos(e);
            void handleScratch(p.x, p.y);
          }}
          onTouchEnd={() => setIsScratching(false)}
        />
      </div>

      <div className="h-1 w-[280px] overflow-hidden rounded-full bg-[rgba(255,255,255,0.06)]">
        <div
          className="h-full rounded-full bg-gradient-to-r from-[#00E5CC] to-[#FFD700] transition-[width] duration-200"
          style={{ width: `${Math.min(100, progress)}%` }}
        />
      </div>

      <p className="mt-1.5 text-center text-xs text-sp-text-dim">
        {revealed ? "" : "Use your finger or mouse to scratch — reveal 50%+"}
      </p>

      {revealed ? (
        <button
          type="button"
          onClick={initCanvas}
          className="mt-3 rounded-[10px] bg-[#00E5CC] px-8 py-3 font-sp-display text-sm font-bold text-[#06080F] transition-transform hover:scale-[1.03]"
        >
          Play Again
        </button>
      ) : null}
    </div>
  );
}
