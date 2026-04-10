import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";

const VISITS_KEY = "securepool:pwa-visits";
const HIDE_UNTIL_KEY = "securepool:pwa-hide-until";
const INSTALLED_KEY = "securepool:pwa-installed";
const REQUIRED_VISITS = 2;
const DISMISS_MS = 7 * 24 * 60 * 60 * 1000;

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

export function InstallPrompt() {
  const { user } = useAuth();
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);

  const isStandalone = useMemo(
    () =>
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true,
    [],
  );

  useEffect(() => {
    if (isStandalone) {
      localStorage.setItem(INSTALLED_KEY, "1");
      setVisible(false);
      return;
    }

    const visits = Number(localStorage.getItem(VISITS_KEY) ?? "0") + 1;
    localStorage.setItem(VISITS_KEY, String(visits));

    const hiddenUntil = Number(localStorage.getItem(HIDE_UNTIL_KEY) ?? "0");
    const alreadyInstalled = localStorage.getItem(INSTALLED_KEY) === "1";
    if (Date.now() < hiddenUntil || alreadyInstalled || visits < REQUIRED_VISITS) {
      setVisible(false);
    }
  }, [isStandalone]);

  useEffect(() => {
    const handler = (event: Event) => {
      event.preventDefault();
      const promptEvent = event as BeforeInstallPromptEvent;
      setDeferredPrompt(promptEvent);

      const visits = Number(localStorage.getItem(VISITS_KEY) ?? "0");
      const hiddenUntil = Number(localStorage.getItem(HIDE_UNTIL_KEY) ?? "0");
      const alreadyInstalled = localStorage.getItem(INSTALLED_KEY) === "1";
      if (!isStandalone && !alreadyInstalled && visits >= REQUIRED_VISITS && Date.now() >= hiddenUntil) {
        setVisible(true);
      }
    };

    const appInstalled = () => {
      localStorage.setItem(INSTALLED_KEY, "1");
      setVisible(false);
      setDeferredPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("appinstalled", appInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      window.removeEventListener("appinstalled", appInstalled);
    };
  }, [isStandalone]);

  const dismiss = () => {
    localStorage.setItem(HIDE_UNTIL_KEY, String(Date.now() + DISMISS_MS));
    setVisible(false);
  };

  const install = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    if (choice.outcome === "accepted") {
      localStorage.setItem(INSTALLED_KEY, "1");
      setVisible(false);
    } else {
      dismiss();
    }
    setDeferredPrompt(null);
  };

  if (!visible || !deferredPrompt || isStandalone) return null;

  return (
    <div
      className={`fixed left-1/2 z-50 w-[min(38rem,calc(100vw-1rem))] -translate-x-1/2 rounded-2xl border bg-[hsl(222,30%,10%)] p-3 shadow-2xl ${
        user ? "bottom-[5.75rem] md:bottom-4" : "bottom-4"
      }`}
      style={{ borderColor: "hsl(217,28%,18%)" }}
      role="dialog"
      aria-label="Install app prompt"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-foreground">
          Install SecurePool for quick access
        </p>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={dismiss} className="text-muted-foreground hover:text-foreground">
            Maybe Later
          </Button>
          <Button size="sm" onClick={() => void install()}>
            Install
          </Button>
        </div>
      </div>
    </div>
  );
}
