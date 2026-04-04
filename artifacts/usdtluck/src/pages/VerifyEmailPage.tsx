import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  ApiError,
  getGetMeQueryKey,
  getGetOtpStatusQueryKey,
  useGetOtpStatus,
  verifyOtp,
  resendOtp,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { useCelebration } from "@/context/CelebrationContext";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiUrl } from "@/lib/api-base";
import { getCsrfToken, setCsrfToken } from "@/lib/csrf";
import { Logo } from "@/components/Logo";

async function ensureCsrf(): Promise<string | null> {
  const res = await fetch(apiUrl("/api/auth/csrf-token"), { credentials: "include" });
  const raw = await res.text();
  const data = raw ? (() => {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  })() : {};
  const token = (data as { csrfToken?: string }).csrfToken ?? null;
  setCsrfToken(token);
  return token ?? getCsrfToken();
}

export default function VerifyEmailPage() {
  const { user, isLoading } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { enqueue } = useCelebration();
  const [digits, setDigits] = useState(["", "", "", "", "", ""]);
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const inputsRef = useRef<(HTMLInputElement | null)[]>([]);
  const autoSubmitLock = useRef(false);

  const { data: otpStatus, refetch: refetchOtp } = useGetOtpStatus({
    query: {
      enabled: !!user,
      refetchInterval: 15_000,
      queryKey: getGetOtpStatusQueryKey(),
    },
  });

  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!isLoading && !user) navigate("/login");
  }, [user, isLoading, navigate]);

  useEffect(() => {
    if (user?.emailVerified) navigate("/dashboard");
  }, [user?.emailVerified, navigate]);

  const expiresAt = otpStatus?.expiresAt ? new Date(otpStatus.expiresAt).getTime() : null;
  const now = Date.now();
  const expireLeftSec =
    expiresAt != null && expiresAt > now ? Math.ceil((expiresAt - now) / 1000) : 0;

  const resendAt = otpStatus?.resendAvailableAt ? new Date(otpStatus.resendAvailableAt).getTime() : 0;
  const resendLeftSec = resendAt > now ? Math.ceil((resendAt - now) / 1000) : 0;

  const blockedUntil = otpStatus?.verifyBlockedUntil
    ? new Date(otpStatus.verifyBlockedUntil).getTime()
    : 0;
  const blockedLeftSec = blockedUntil > now ? Math.ceil((blockedUntil - now) / 1000) : 0;

  void tick;

  const submitCode = useCallback(
    async (code: string) => {
      if (code.length !== 6 || submitting || autoSubmitLock.current) return;
      autoSubmitLock.current = true;
      setSubmitting(true);
      try {
        const token = await ensureCsrf();
        await verifyOtp(
          { otp_code: code },
          {
            credentials: "include",
            headers: {
              "Content-Type": "application/json",
              ...(token ? { "x-csrf-token": token } : {}),
            },
          },
        );
        await queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
        await queryClient.invalidateQueries({ queryKey: getGetOtpStatusQueryKey() });
        toast({ title: "Email verified", description: "You're ready to play." });
        enqueue({
          kind: "deposit",
          title: "✅ You're verified!",
          message: "Your email is confirmed. Join pools, deposit, and withdraw anytime.",
          dedupeKey: "email-verified-session",
        });
        navigate("/dashboard");
        return;
      } catch (e: unknown) {
        const data = e instanceof ApiError ? (e.data as { message?: string } | null) : null;
        const msg = data?.message ?? (e instanceof Error ? e.message : "Verification failed");
        toast({ title: "Couldn't verify", description: msg, variant: "destructive" });
        setDigits(["", "", "", "", "", ""]);
        void refetchOtp();
        inputsRef.current[0]?.focus();
        autoSubmitLock.current = false;
      } finally {
        setSubmitting(false);
      }
    },
    [submitting, queryClient, toast, enqueue, navigate, refetchOtp],
  );

  useEffect(() => {
    const code = digits.join("");
    if (code.length === 6 && /^\d{6}$/.test(code)) {
      void submitCode(code);
    }
  }, [digits, submitCode]);

  function setDigit(i: number, v: string) {
    const d = v.replace(/\D/g, "").slice(-1);
    setDigits((prev) => {
      const next = [...prev];
      next[i] = d;
      return next;
    });
    if (d && i < 5) inputsRef.current[i + 1]?.focus();
  }

  function onKeyDown(i: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !digits[i] && i > 0) {
      inputsRef.current[i - 1]?.focus();
    }
  }

  async function handleResend() {
    if (resending || resendLeftSec > 0 || blockedLeftSec > 0) return;
    setResending(true);
    try {
      const token = await ensureCsrf();
      await resendOtp({
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { "x-csrf-token": token } : {}),
        },
      });
      toast({ title: "Code sent", description: "Check your inbox for a new 6-digit code." });
      await refetchOtp();
      setDigits(["", "", "", "", "", ""]);
      inputsRef.current[0]?.focus();
    } catch (e: unknown) {
      const err = e as { body?: { message?: string } };
      toast({
        title: "Could not resend",
        description: err?.body?.message ?? "Try again in a minute.",
        variant: "destructive",
      });
      void refetchOtp();
    } finally {
      setResending(false);
    }
  }

  if (isLoading || !user) return null;

  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-6">
          <Logo size="md" />
        </div>
        <div
          className="rounded-2xl border border-cyan-500/20 bg-[hsl(222,30%,9%)] p-6 sm:p-8 shadow-2xl"
          style={{ boxShadow: "0 0 60px rgba(0,212,255,0.06)" }}
        >
          <h1 className="text-xl sm:text-2xl font-bold text-center text-white mb-1">Verify your email</h1>
          <p className="text-sm text-muted-foreground text-center mb-6">
            We sent a 6-digit code to <span className="text-cyan-400 font-medium">{user.email}</span>
          </p>

          {blockedLeftSec > 0 && (
            <p className="text-sm text-amber-400 text-center mb-4">
              Too many attempts. Try again in {Math.floor(blockedLeftSec / 60)}:
              {String(blockedLeftSec % 60).padStart(2, "0")}
            </p>
          )}

          <div className="flex justify-center gap-2 sm:gap-2.5 mb-2">
            {[0, 1, 2].map((i) => (
              <input
                key={i}
                ref={(el) => {
                  inputsRef.current[i] = el;
                }}
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={1}
                value={digits[i]}
                disabled={submitting || blockedLeftSec > 0}
                onChange={(e) => setDigit(i, e.target.value)}
                onKeyDown={(e) => onKeyDown(i, e)}
                className="w-10 h-12 sm:w-12 sm:h-14 text-center text-xl font-mono font-bold rounded-lg bg-[#0A1628] border border-cyan-500/35 text-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 disabled:opacity-50"
              />
            ))}
            <span className="self-center text-muted-foreground px-1">—</span>
            {[3, 4, 5].map((i) => (
              <input
                key={i}
                ref={(el) => {
                  inputsRef.current[i] = el;
                }}
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={1}
                value={digits[i]}
                disabled={submitting || blockedLeftSec > 0}
                onChange={(e) => setDigit(i, e.target.value)}
                onKeyDown={(e) => onKeyDown(i, e)}
                className="w-10 h-12 sm:w-12 sm:h-14 text-center text-xl font-mono font-bold rounded-lg bg-[#0A1628] border border-cyan-500/35 text-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 disabled:opacity-50"
              />
            ))}
          </div>

          <p className="text-center text-sm text-amber-200/90 mb-6">
            {expireLeftSec > 0 ? (
              <>
                Code expires in{" "}
                <span className="font-mono font-semibold tabular-nums">
                  {Math.floor(expireLeftSec / 60)}:{String(expireLeftSec % 60).padStart(2, "0")}
                </span>
              </>
            ) : otpStatus?.hasPendingOtp === false ? (
              <span className="text-amber-400">Code expired — resend a new one.</span>
            ) : null}
          </p>

          <Button
            type="button"
            variant="outline"
            className="w-full border-cyan-500/30 text-cyan-300 hover:bg-cyan-500/10 mb-4"
            disabled={resending || resendLeftSec > 0 || blockedLeftSec > 0}
            onClick={() => void handleResend()}
          >
            {resending
              ? "Sending…"
              : resendLeftSec > 0
                ? `Resend in ${resendLeftSec}s`
                : "Resend code"}
          </Button>

          <p className="text-xs text-center text-muted-foreground">
            Wrong inbox? Check spam, or{" "}
            <Link href="/profile" className="text-cyan-400 hover:underline">
              profile settings
            </Link>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
