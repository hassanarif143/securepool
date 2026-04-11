import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Logo";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

const TRUST_ITEMS = [
  { icon: "🔒", label: "Provably Fair", mobile: true },
  { icon: "⚡", label: "Instant Credit", mobile: true },
  { icon: "💎", label: "No Hidden Fees", mobile: false },
  { icon: "🎯", label: "Transparent System", mobile: false },
] as const;

function SocialX({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function SocialTelegram({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden fill="currentColor">
      <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
    </svg>
  );
}

function SocialDiscord({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden fill="currentColor">
      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
    </svg>
  );
}

const FOOTER_LINK_CLASS =
  "text-sm text-slate-400 hover:text-cyan-400 transition-colors duration-200";

export function SiteFooter({ extraMobileBottomSpace = false }: { extraMobileBottomSpace?: boolean }) {
  const year = new Date().getFullYear();

  return (
    <footer
      className={cn(
        "mt-auto border-t border-cyan-500/20 shadow-[0_-4px_48px_-12px_rgba(6,182,212,0.12)]",
        extraMobileBottomSpace && "pb-[calc(4.25rem+env(safe-area-inset-bottom,0px))] md:pb-0",
      )}
      style={{ background: "#050a14" }}
    >
      {/* Cyan glow line */}
      <div
        className="h-[1px] w-full bg-gradient-to-r from-transparent via-cyan-400/50 to-transparent"
        aria-hidden
      />

      {/* Trust bar */}
      <div className="border-b border-white/[0.06]">
        <div className="page-container py-4 sm:py-5">
          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 sm:gap-x-4 sm:gap-y-3 md:justify-between md:gap-x-6">
            {TRUST_ITEMS.map((item) => (
              <div
                key={item.label}
                className={cn(
                  "group flex items-center gap-2 rounded-full border border-white/5 bg-white/[0.03] px-3 py-1.5 sm:px-4 sm:py-2",
                  "transition-all duration-300 hover:border-cyan-500/35 hover:bg-cyan-500/5 hover:shadow-[0_0_20px_-6px_rgba(6,182,212,0.35)]",
                  !item.mobile && "hidden md:flex",
                )}
              >
                <span
                  className="text-base transition-transform duration-300 group-hover:scale-110"
                  aria-hidden
                >
                  {item.icon}
                </span>
                <span className="text-xs sm:text-sm font-medium text-slate-300 group-hover:text-cyan-100/95">
                  {item.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="page-container py-10 sm:py-14">
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 sm:gap-10 md:grid-cols-3 md:gap-8 lg:grid-cols-4">
          {/* Branding */}
          <div className="space-y-4">
            <Link href="/" className="inline-flex items-center gap-2 rounded-lg outline-none ring-offset-2 ring-offset-[#050a14] focus-visible:ring-2 focus-visible:ring-cyan-500/50">
              <Logo size="md" showText />
            </Link>
            <p className="max-w-xs text-sm leading-relaxed text-slate-400 hidden sm:block">
              Transparent USDT reward pools with fair draws. Join live pools, track your tickets, and withdraw with
              clarity.
            </p>
            <p className="text-xs text-slate-400 sm:hidden">Fair USDT pools — transparent draws.</p>
            <p className="text-xs text-slate-500 hidden sm:block">© {year} SecurePool. All rights reserved.</p>
          </div>

          {/* Product */}
          <div>
            <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-cyan-500/90">Product</p>
            <ul className="space-y-3">
              <li>
                <Link href="/pools" className={FOOTER_LINK_CLASS}>
                  Live Pools
                </Link>
              </li>
              <li>
                <Link href="/how-it-works" className={FOOTER_LINK_CLASS}>
                  How It Works
                </Link>
              </li>
              <li>
                <Link href="/rewards" className={FOOTER_LINK_CLASS}>
                  Rewards
                </Link>
              </li>
              <li>
                <Link href="/wallet" className={FOOTER_LINK_CLASS}>
                  Wallet
                </Link>
              </li>
            </ul>
          </div>

          {/* Support — desktop / tablet */}
          <div className="hidden md:block">
            <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-cyan-500/90">Support</p>
            <ul className="space-y-3">
              <li>
                <Link href="/how-it-works" className={FOOTER_LINK_CLASS}>
                  Help Center
                </Link>
              </li>
              <li>
                <a href="mailto:support@securepool.app" className={FOOTER_LINK_CLASS}>
                  Contact
                </a>
              </li>
              <li>
                <Link href="/how-it-works" className={FOOTER_LINK_CLASS}>
                  FAQs
                </Link>
              </li>
              <li>
                <a
                  href="mailto:support@securepool.app?subject=Issue%20report"
                  className={FOOTER_LINK_CLASS}
                >
                  Report Issue
                </a>
              </li>
            </ul>
          </div>

          {/* Legal & trust — desktop / tablet */}
          <div className="hidden lg:block">
            <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-cyan-500/90">Legal &amp; Trust</p>
            <ul className="space-y-3">
              <li>
                <a
                  href="mailto:support@securepool.app?subject=Terms%20of%20Service"
                  className={FOOTER_LINK_CLASS}
                >
                  Terms
                </a>
              </li>
              <li>
                <a
                  href="mailto:support@securepool.app?subject=Privacy%20Policy"
                  className={FOOTER_LINK_CLASS}
                >
                  Privacy
                </a>
              </li>
              <li>
                <Link href="/provably-fair" className={FOOTER_LINK_CLASS}>
                  Fairness Info
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Mobile: compact trust / legal links (full columns hidden on small screens) */}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 border-t border-white/[0.06] pt-8 text-[11px] text-slate-500 md:hidden">
          <a href="mailto:support@securepool.app" className="hover:text-cyan-400 transition-colors">
            Contact
          </a>
          <Link href="/provably-fair" className="hover:text-cyan-400 transition-colors">
            Fairness
          </Link>
          <a
            href="mailto:support@securepool.app?subject=Issue%20report"
            className="hover:text-cyan-400 transition-colors"
          >
            Report
          </a>
        </div>

        {/* Social + CTA */}
        <div className="mt-8 flex flex-col items-stretch gap-6 border-t border-white/[0.06] pt-8 sm:mt-12 sm:pt-10 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center justify-center gap-4 sm:justify-start">
            <a
              href="https://x.com"
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-[#111827] text-slate-400 transition-all duration-200 hover:border-cyan-500/40 hover:text-cyan-300 hover:shadow-[0_0_20px_-8px_rgba(6,182,212,0.45)]"
              aria-label="X (Twitter)"
            >
              <SocialX className="h-4 w-4" />
            </a>
            <a
              href="https://t.me"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-[#111827] text-slate-400 transition-all duration-200 hover:border-cyan-500/40 hover:text-cyan-300 hover:shadow-[0_0_20px_-8px_rgba(6,182,212,0.45)] sm:flex"
              aria-label="Telegram"
            >
              <SocialTelegram className="h-5 w-5" />
            </a>
            <a
              href="https://discord.com"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-[#111827] text-slate-400 transition-all duration-200 hover:border-cyan-500/40 hover:text-cyan-300 hover:shadow-[0_0_20px_-8px_rgba(6,182,212,0.45)] sm:flex"
              aria-label="Discord"
            >
              <SocialDiscord className="h-5 w-5" />
            </a>
          </div>

          <Button
            asChild
            className="h-12 rounded-xl bg-cyan-600 px-8 text-base font-semibold text-white shadow-lg shadow-cyan-900/30 transition-all hover:bg-cyan-500 hover:shadow-[0_0_28px_-6px_rgba(6,182,212,0.55)] sm:min-w-[220px]"
          >
            <Link href="/pools" className="inline-flex items-center justify-center gap-2">
              Join a Pool Now
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </Button>
        </div>
      </div>

      {/* Bottom strip */}
      <div className="border-t border-white/[0.06] py-4">
        <p className="text-center text-[11px] sm:text-xs text-slate-500">
          © {year} SecurePool — Transparent USDT Reward Platform
        </p>
      </div>
    </footer>
  );
}
