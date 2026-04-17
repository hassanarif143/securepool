import { useState } from "react";
import { apiUrl } from "@/lib/api-base";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function SPTOnboardingGuide({ done, onCompleted }: { done: boolean; onCompleted: () => void }) {
  const [step, setStep] = useState(0);
  const [open, setOpen] = useState(!done);

  if (done) return null;

  async function finish() {
    const csrfRes = await fetch(apiUrl("/api/auth/csrf-token"), { credentials: "include" });
    const csrfData = await csrfRes.json().catch(() => ({}));
    const token = (csrfData as { csrfToken?: string }).csrfToken;
    await fetch(apiUrl("/api/spt/onboarding/complete"), {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", ...(token ? { "x-csrf-token": token } : {}) },
      body: "{}",
    });
    try {
      localStorage.setItem("spt_onboarding_done", "1");
    } catch {
      /* ignore */
    }
    onCompleted();
    setOpen(false);
  }

  const slides = [
    {
      title: "What is SPT?",
      body: (
        <div className="space-y-2 text-sm text-muted-foreground">
          <p>
            <strong className="text-foreground">SecurePool Token (SPT)</strong> is our in-platform loyalty reward. It is{" "}
            <strong>not</strong> a real cryptocurrency and <strong>cannot</strong> be withdrawn as USDT.
          </p>
          <p>Use SPT for discounts, free entries, and exclusive draws inside SecurePool.</p>
        </div>
      ),
    },
    {
      title: "How to earn",
      body: (
        <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1">
          <li>Pools & games</li>
          <li>Daily login streak</li>
          <li>Referrals & first deposit bonus</li>
        </ul>
      ),
    },
    {
      title: "How to spend",
      body: (
        <p className="text-sm text-muted-foreground">
          Redeem SPT for ticket discounts, VIP pool access, and special mega draws — all inside the app.
        </p>
      ),
    },
    {
      title: "What’s next",
      body: (
        <div className="text-sm text-muted-foreground space-y-2">
          <p>We’re building staking, marketplace perks, and community features — early users benefit most.</p>
        </div>
      ),
    },
  ];

  const s = slides[step]!;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-md border-[var(--green-border)] bg-[#0A0E1A]">
        <DialogHeader>
          <DialogTitle>{s.title}</DialogTitle>
        </DialogHeader>
        {s.body}
        <div className="flex justify-between gap-2 pt-2">
          <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
            Later
          </Button>
          <div className="flex gap-2">
            {step > 0 && (
              <Button type="button" variant="outline" size="sm" onClick={() => setStep((x) => x - 1)}>
                Back
              </Button>
            )}
            {step < slides.length - 1 ? (
              <Button type="button" size="sm" onClick={() => setStep((x) => x + 1)}>
                Next
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                className="bg-[var(--green)] text-[var(--green-text)] hover:bg-[var(--green-hover)]"
                onClick={() => void finish()}
              >
                Start earning
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
