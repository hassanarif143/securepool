import { useState } from "react";
import { cn } from "@/lib/utils";
import { LANDING_FAQ_ITEMS } from "./landing-faq-data";

export function LandingFaqAccordion() {
  const [open, setOpen] = useState(0);

  return (
    <div className="mt-8 space-y-3">
      {LANDING_FAQ_ITEMS.map((item, i) => {
        const isOpen = open === i;
        return (
          <div
            key={item.q}
            className={cn(
              "overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.02] transition-colors",
              isOpen && "border-cyan-500/35 bg-cyan-500/[0.04] shadow-[0_0_24px_-8px_rgba(6,182,212,0.25)]",
            )}
          >
            <button
              type="button"
              className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left text-sm font-bold text-white sm:px-5"
              onClick={() => setOpen(isOpen ? -1 : i)}
              aria-expanded={isOpen}
            >
              {item.q}
              <span className="text-xl font-light text-cyan-400/90 transition-transform duration-200">{isOpen ? "×" : "+"}</span>
            </button>
            {isOpen ? (
              <div className="border-t border-white/[0.06] px-4 pb-4 pt-0 text-sm leading-[1.7] text-[#94a3b8] sm:px-5">
                {item.a}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
