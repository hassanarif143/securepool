import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import confetti from "canvas-confetti";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { apiUrl } from "@/lib/api-base";
import { friendlyErrorFromResponse, friendlyNetworkError } from "@/lib/user-facing-errors";
import { tronAddressQrUrl } from "@/lib/qr-data-url";
import { SUPPORT_WHATSAPP_HREF } from "@/lib/support-links";
import { parseDepositRejection } from "@/lib/payment-rejection-reasons";
import { BinanceGuideModal } from "./BinanceGuideModal";
import { TxIdHelpModal } from "./TxIdHelpModal";
import { UsdtAmount } from "@/components/UsdtAmount";
import { appToast } from "@/components/feedback/AppToast";
import { ChevronLeft, Copy, ExternalLink } from "lucide-react";

const LS_KEY = "securepool_deposit_flow_v1";
const WINDOW_MS = 2 * 60 * 60 * 1000;

type WalletChoice = "binance" | "trust" | "other";

type Pending = { id: number; amount: string; createdAt: string; status: string } | null;

type Props = {
  platformAddress: string;
  networkLabel: string;
  hasCryptoAddress: boolean;
  pendingDeposit: Pending;
  rejectedDeposit: { id: number; note?: string | null } | null;
  onFlowComplete: () => void;
};

function loadLs(): { txId: number; step: number } | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const j = JSON.parse(raw) as { txId?: number; step?: number };
    if (typeof j.txId === "number" && typeof j.step === "number") return { txId: j.txId, step: j.step };
  } catch {
    /* ignore */
  }
  return null;
}

function saveLs(txId: number, step: number) {
  localStorage.setItem(LS_KEY, JSON.stringify({ txId, step, t: Date.now() }));
}

function clearLs() {
  localStorage.removeItem(LS_KEY);
}

function openBinanceApp() {
  try {
    window.location.href = "bnc://app.binance.com/payment/";
  } catch {
    /* ignore */
  }
  window.setTimeout(() => {
    window.open("https://www.binance.com/en/my/wallet/account/main/withdrawal/crypto/USDT", "_blank", "noopener,noreferrer");
  }, 1800);
}

export function DepositWizard({
  platformAddress,
  networkLabel,
  hasCryptoAddress,
  pendingDeposit,
  rejectedDeposit,
  onFlowComplete,
}: Props) {
  const [step, setStep] = useState(1);
  const [wallet, setWallet] = useState<WalletChoice>("binance");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [screenshotFile, setScreenshotFile] = useState<File | null>(null);
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [depositLoading, setDepositLoading] = useState(false);
  const [activeTxId, setActiveTxId] = useState<number | null>(null);
  const [pollStatus, setPollStatus] = useState<string | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);
  const [txHelpOpen, setTxHelpOpen] = useState(false);
  const [deadline, setDeadline] = useState<number | null>(null);
  const [remainMs, setRemainMs] = useState(WINDOW_MS);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const amtNum = parseFloat(amount || "0");
  const validAmt = Number.isFinite(amtNum) && amtNum >= 1;
  const summaryAmount = validAmt ? amtNum : parseFloat(String(pendingDeposit?.amount ?? "0")) || 0;

  useEffect(() => {
    if (step !== 2) {
      setDeadline(null);
      return;
    }
    if (validAmt && deadline === null) {
      setDeadline(Date.now() + WINDOW_MS);
    }
  }, [step, validAmt, deadline]);

  const rejectionParsed = useMemo(
    () => (rejectedDeposit?.note ? parseDepositRejection(rejectedDeposit.note) : null),
    [rejectedDeposit],
  );

  /* Resume pending from server or localStorage */
  useEffect(() => {
    if (pendingDeposit?.status === "pending") {
      setActiveTxId(pendingDeposit.id);
      setStep(4);
      saveLs(pendingDeposit.id, 4);
      setPollStatus("pending");
      return;
    }
    const ls = loadLs();
    if (ls?.txId) {
      void (async () => {
        try {
          const res = await fetch(apiUrl(`/api/transactions/my/${ls.txId}`), { credentials: "include" });
          if (!res.ok) {
            clearLs();
            return;
          }
          const j = (await res.json()) as { status: string; id: number };
          if (j.status === "pending") {
            setActiveTxId(j.id);
            setStep(4);
            setPollStatus("pending");
          } else if (j.status === "completed") {
            setActiveTxId(j.id);
            setStep(5);
            clearLs();
          } else {
            clearLs();
          }
        } catch {
          clearLs();
        }
      })();
    }
  }, [pendingDeposit?.id, pendingDeposit?.status]);

  /* Countdown for payment window (UX only — server may differ) */
  useEffect(() => {
    if (step !== 2 || !deadline) return;
    const t = window.setInterval(() => {
      setRemainMs(Math.max(0, deadline - Date.now()));
    }, 1000);
    return () => window.clearInterval(t);
  }, [step, deadline]);

  /* Poll deposit status */
  useEffect(() => {
    if (step !== 4 || !activeTxId) return;
    let cancelled = false;
    async function tick() {
      try {
        const res = await fetch(apiUrl(`/api/transactions/my/${activeTxId}`), { credentials: "include" });
        if (!res.ok) return;
        const j = (await res.json()) as { status: string };
        if (cancelled) return;
        setPollStatus(j.status);
        if (j.status === "completed") {
          clearLs();
          setStep(5);
          void confetti({ particleCount: 120, spread: 70, origin: { y: 0.6 } });
          onFlowComplete();
          return;
        }
        if (j.status === "rejected") {
          clearLs();
          appToast.error({
            title: "Payment could not be verified",
            description: "See details in Wallet history. You can start a new deposit.",
          });
          setStep(1);
          onFlowComplete();
        }
      } catch {
        /* ignore */
      }
    }
    void tick();
    const id = window.setInterval(tick, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [step, activeTxId, onFlowComplete]);

  const copyAddress = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(platformAddress);
      setCopied(true);
      try {
        navigator.vibrate?.(40);
      } catch {
        /* ignore */
      }
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      appToast.error({ title: "Copy failed" });
    }
  }, [platformAddress]);

  const handleFile = (file: File | null) => {
    if (!file) return;
    setScreenshotFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setScreenshotPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  async function submitDeposit() {
    if (!hasCryptoAddress) return;
    if (!validAmt || !screenshotFile) {
      appToast.error({ title: "Amount and screenshot required" });
      return;
    }
    setDepositLoading(true);
    try {
      const formData = new FormData();
      formData.append("amount", String(amtNum));
      formData.append("screenshot", screenshotFile);
      if (note.trim()) formData.append("note", note.trim());

      const res = await fetch(apiUrl("/api/transactions/deposit"), { method: "POST", credentials: "include", body: formData });
      if (!res.ok) throw new Error(await friendlyErrorFromResponse(res));
      const j = (await res.json()) as { id: number };
      setActiveTxId(j.id);
      saveLs(j.id, 4);
      setStep(4);
      setPollStatus("pending");
      onFlowComplete();
      appToast.success({ title: "Proof submitted", description: "We're verifying your payment." });
    } catch (e: unknown) {
      appToast.error({
        title: "Submit failed",
        description: e instanceof Error ? e.message : friendlyNetworkError(e),
      });
    } finally {
      setDepositLoading(false);
    }
  }

  const progressPct = (step / 5) * 100;
  const qrSrc = tronAddressQrUrl(platformAddress, 280);

  const fmtTime = (ms: number) => {
    const s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  };

  if (!hasCryptoAddress) {
    return (
      <div className="rounded-xl border border-yellow-500/35 bg-yellow-500/10 p-4 text-sm text-yellow-200">
        Pehle Profile mein apna TRON (USDT) wallet address add karein — phir deposit wizard open hoga.
        <Button asChild className="mt-3 w-full min-h-12" variant="secondary">
          <Link href="/profile">Open Profile</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Step {step} of 5</p>
          <Progress value={progressPct} className="mt-1.5 h-2" />
        </div>
        <span className="text-[10px] text-muted-foreground tabular-nums">{Math.round(progressPct)}%</span>
      </div>

      {rejectionParsed ? (
        <div className="rounded-xl border border-red-500/35 bg-red-950/25 p-4 space-y-2">
          <p className="text-sm font-semibold text-red-200">Payment could not be verified</p>
          <p className="text-xs text-red-100/90 leading-relaxed">{rejectionParsed.message || "Please upload clearer proof or contact support."}</p>
          <p className="text-[10px] text-muted-foreground">Deposit ID: #{rejectedDeposit?.id}</p>
        </div>
      ) : null}

      {/* Step 1 */}
      {step === 1 && (
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold text-foreground">How will you send USDT?</h3>
            <p className="text-xs text-muted-foreground mt-1">Choose your app — instructions only; any wallet that sends USDT on TRON works.</p>
          </div>
          <div className="grid gap-2">
            {(
              [
                { id: "binance" as const, icon: "🟡", title: "Binance App", sub: "Pakistan mein sabse common — recommended", rec: true },
                { id: "trust" as const, icon: "🔵", title: "Trust Wallet", sub: "Mobile wallet — easy for beginners" },
                { id: "other" as const, icon: "📱", title: "Other wallet", sub: "Any app that supports USDT on TRON" },
              ] as const
            ).map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setWallet(c.id)}
                className={cn(
                  "flex w-full items-start gap-3 rounded-xl border p-4 text-left transition-colors min-h-[56px]",
                  wallet === c.id ? "border-cyan-500/60 bg-cyan-500/10 ring-1 ring-cyan-500/30" : "border-border/80 bg-muted/15 hover:bg-muted/25",
                )}
              >
                <span className="text-2xl">{c.icon}</span>
                <span className="flex-1 min-w-0">
                  <span className="flex items-center gap-2 font-semibold text-sm">
                    {c.title}
                    {c.id === "binance" ? (
                      <span className="text-[10px] font-bold uppercase tracking-wide text-emerald-400 border border-emerald-500/40 rounded px-1.5 py-0.5">Recommended</span>
                    ) : null}
                  </span>
                  <span className="block text-xs text-muted-foreground mt-0.5">{c.sub}</span>
                </span>
                {wallet === c.id ? <span className="text-cyan-400 font-bold">✓</span> : null}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            USDT abhi nahi hai?{" "}
            <Link href="/how-to-buy-usdt" className="text-cyan-400 font-semibold underline underline-offset-2">
              Yahan dekhein: USDT kaise khareedein (Pakistan)
            </Link>
          </p>
          <Button type="button" className="w-full min-h-[52px] font-semibold" onClick={() => setStep(2)}>
            Next →
          </Button>
        </div>
      )}

      {/* Step 2 */}
      {step === 2 && (
        <div className="space-y-4">
          <Button type="button" variant="ghost" size="sm" className="gap-1 -ml-2 text-muted-foreground" onClick={() => setStep(1)}>
            <ChevronLeft className="h-4 w-4" /> Back
          </Button>
          <div>
            <Label className="text-xs font-semibold uppercase text-muted-foreground">Kitna USDT bhejna hai?</Label>
            <Input
              type="number"
              min={1}
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="e.g. 10"
              className="mt-1.5 font-semibold tabular-nums min-h-12"
            />
            <p className="text-[10px] text-muted-foreground mt-1">Minimum usually 1 USDT — bilkul wahi amount bhejein jo yahan likhein.</p>
          </div>

          {validAmt ? (
            <>
              <div className="rounded-xl border border-border/90 bg-card/40 p-4 space-y-3">
                <div className="text-center space-y-1">
                  <p className="text-sm font-semibold">Send exactly</p>
                  <div className="flex justify-center">
                    <UsdtAmount amount={amtNum} amountClassName="text-lg font-bold text-cyan-400 tabular-nums" />
                  </div>
                  <p className="text-xs text-muted-foreground">to:</p>
                </div>
                <div className="flex justify-center">
                  <img src={qrSrc} alt="QR code for USDT deposit address" className="w-[220px] h-[220px] rounded-lg bg-white p-2" width={220} height={220} />
                </div>
                <code className="block text-center break-all font-mono text-[11px] text-foreground/90 px-1">{platformAddress}</code>
                <div className="flex flex-wrap gap-2 justify-center">
                  <Button type="button" variant="secondary" className="min-h-11 gap-2" onClick={() => void copyAddress()}>
                    <Copy className="h-4 w-4" />
                    {copied ? "Copied!" : "Copy address"}
                  </Button>
                  <Button type="button" variant="outline" className="min-h-11 gap-1" onClick={openBinanceApp}>
                    Open Binance <ExternalLink className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              <div className="rounded-xl border border-amber-500/30 bg-amber-950/20 p-3 text-xs space-y-2">
                <p className="font-bold text-amber-200">⚠️ IMPORTANT — pehle parh lein</p>
                <ul className="space-y-1.5 text-amber-100/90 leading-relaxed">
                  <li>
                    ✅ Network: <strong>TRON (USDT)</strong> — Binance mein withdrawal par TRON network select karein.
                  </li>
                  <li>
                    ✅ Amount: bilkul <strong>{amtNum.toFixed(2)} USDT</strong> — na zyada, na kam.
                  </li>
                  <li>❌ Galat network = paisa recover nahi hota. Yahan hamesha TRON (USDT) use karein.</li>
                </ul>
              </div>

              <button type="button" className="text-xs text-cyan-400 font-semibold underline text-left w-full" onClick={() => setGuideOpen(true)}>
                📖 Step-by-step Binance guide
              </button>

              <p className="text-center text-sm font-mono text-cyan-300/90">
                ⏰ Complete within: {fmtTime(remainMs)}
              </p>
            </>
          ) : (
            <p className="text-xs text-muted-foreground text-center">Upar valid amount daalein — phir QR aur address dikhega.</p>
          )}

          <div className="flex gap-2">
            <Button type="button" variant="outline" className="flex-1 min-h-12" onClick={() => setStep(1)}>
              ← Back
            </Button>
            <Button type="button" className="flex-1 min-h-12 font-semibold" disabled={!validAmt} onClick={() => setStep(3)}>
              I&apos;ve sent it →
            </Button>
          </div>
        </div>
      )}

      {/* Step 3 */}
      {step === 3 && (
        <div className="space-y-4">
          <Button type="button" variant="ghost" size="sm" className="gap-1 -ml-2" onClick={() => setStep(2)}>
            <ChevronLeft className="h-4 w-4" /> Back
          </Button>
          <h3 className="text-lg font-semibold">Upload payment proof</h3>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Binance / wallet ki <strong>completed</strong> screen ka screenshot — jisme amount, address, aur status dikhe.
          </p>

          <div className="rounded-xl border border-dashed border-border/80 bg-muted/20 p-3">
            <p className="text-[10px] font-semibold uppercase text-muted-foreground mb-2">Example (aise dikhe)</p>
            <div className="rounded-lg bg-gradient-to-br from-slate-800 to-slate-900 border border-white/10 p-4 text-[10px] text-muted-foreground space-y-2">
              <div className="flex justify-between"><span>Amount</span><span className="text-cyan-400">→ {validAmt ? `${amtNum.toFixed(2)} USDT` : "—"}</span></div>
              <div className="flex justify-between"><span>Status</span><span className="text-emerald-400">→ Completed</span></div>
              <div className="flex justify-between gap-2"><span>To</span><span className="break-all text-right">→ T… (address)</span></div>
            </div>
          </div>

          <div
            className="cursor-pointer rounded-xl border-2 border-dashed border-border/90 bg-muted/15 p-6 text-center min-h-[140px] flex flex-col items-center justify-center"
            onClick={() => fileRef.current?.click()}
            onKeyDown={(e) => e.key === "Enter" && fileRef.current?.click()}
            role="button"
            tabIndex={0}
          >
            {screenshotPreview ? (
              <div className="space-y-2">
                <img src={screenshotPreview} alt="Preview" className="max-h-44 mx-auto rounded-md object-contain" />
                <Button type="button" variant="link" className="text-xs h-auto p-0" onClick={(e) => { e.stopPropagation(); setScreenshotFile(null); setScreenshotPreview(null); }}>
                  Upload different image
                </Button>
              </div>
            ) : (
              <>
                <span className="text-3xl mb-2">📤</span>
                <p className="text-sm font-medium">Tap to upload screenshot</p>
                <p className="text-xs text-muted-foreground mt-1">JPG / PNG · max 10MB</p>
              </>
            )}
          </div>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleFile(e.target.files?.[0] ?? null)} />
          <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => handleFile(e.target.files?.[0] ?? null)} />
          <Button type="button" variant="outline" size="sm" className="w-full min-h-11" onClick={() => cameraInputRef.current?.click()}>
            📷 Take photo (camera)
          </Button>

          <div className="space-y-1.5">
            <Label className="text-xs">TxID (optional — tez verification)</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Paste transaction hash / TxID" className="font-mono text-xs min-h-11" />
            <button type="button" className="text-[10px] text-cyan-400 underline" onClick={() => setTxHelpOpen(true)}>
              TxID kahan milta hai?
            </button>
          </div>

          <Button
            type="button"
            className="w-full min-h-[52px] font-semibold"
            disabled={!screenshotFile || depositLoading || !validAmt}
            onClick={() => void submitDeposit()}
          >
            {depositLoading ? "Submitting…" : "Submit proof →"}
          </Button>
        </div>
      )}

      {/* Step 4 */}
      {step === 4 && activeTxId && (
        <div className="space-y-4 text-center py-2">
          <div className="text-4xl">⏳</div>
          <h3 className="text-lg font-semibold">Verification in progress</h3>
          <p className="text-xs text-muted-foreground leading-relaxed px-2">
            Aapka payment dekh rahe hain. Usually <strong>15–30 minutes</strong> lagte hain — kabhi kabhi zyada.
          </p>
          <div className="rounded-xl border border-border/80 bg-muted/20 p-4 text-left text-xs space-y-2">
            <p className="font-semibold text-foreground">Payment summary</p>
            {summaryAmount > 0 ? (
              <p>
                Amount: <UsdtAmount amount={summaryAmount} amountClassName="font-bold text-cyan-300" />
              </p>
            ) : null}
            <p>Network: {networkLabel}</p>
            <p>Status: {pollStatus === "pending" ? "🟡 Under review" : pollStatus ?? "…"}</p>
          </div>
          <ul className="text-left text-xs space-y-2 max-w-sm mx-auto text-muted-foreground">
            <li>✅ USDT bhej diya</li>
            <li>✅ Screenshot submit ho gaya</li>
            <li>🔄 Admin verify kar raha hai…</li>
            <li>⬜ Wallet mein balance add</li>
          </ul>
          <p className="text-[11px] text-muted-foreground">Page band kar sakte hain — hum notify kar den ge.</p>
          <a href={SUPPORT_WHATSAPP_HREF} target="_blank" rel="noopener noreferrer" className="inline-flex rounded-xl border border-emerald-500/30 bg-emerald-950/20 px-4 py-3 text-xs text-emerald-200 w-full max-w-sm mx-auto justify-center">
            💬 WhatsApp support
          </a>
          <Button asChild variant="secondary" className="w-full min-h-12">
            <Link href="/dashboard">Go to Dashboard</Link>
          </Button>
        </div>
      )}

      {/* Step 5 */}
      {step === 5 && (
        <div className="space-y-4 text-center py-2">
          <div className="text-4xl">🎉</div>
          <h3 className="text-lg font-semibold text-emerald-300">Payment confirmed!</h3>
          <p className="text-xs text-muted-foreground">Balance update ho chuka hai — ab pools join kar sakte hain.</p>
          <div className="flex flex-wrap gap-2 justify-center">
            <Button asChild className="min-h-12">
              <Link href="/pools">View pools</Link>
            </Button>
            <Button
              type="button"
              variant="outline"
              className="min-h-12"
              onClick={() => {
                setStep(1);
                setAmount("");
                setScreenshotFile(null);
                setScreenshotPreview(null);
                clearLs();
              }}
            >
              Add more funds
            </Button>
          </div>
        </div>
      )}

      <BinanceGuideModal open={guideOpen} onOpenChange={setGuideOpen} />
      <TxIdHelpModal open={txHelpOpen} onOpenChange={setTxHelpOpen} />
    </div>
  );
}
