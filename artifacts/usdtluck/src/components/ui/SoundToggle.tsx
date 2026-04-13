import { useSound } from "@/hooks/useSound";
import { cn } from "@/lib/utils";

export function SoundToggle({ className }: { className?: string }) {
  const { isMuted, toggleMute, play } = useSound();
  return (
    <button
      type="button"
      onClick={() => {
        play("toggle");
        toggleMute();
      }}
      onPointerEnter={() => play("hover")}
      className={cn(
        "inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-sm text-sp-text transition",
        "hover:border-white/20 hover:bg-white/[0.06] active:scale-[0.98]",
        className,
      )}
      aria-label={isMuted ? "Unmute sound" : "Mute sound"}
      title={isMuted ? "Unmute" : "Mute"}
    >
      <span aria-hidden className="select-none">
        {isMuted ? "🔇" : "🔊"}
      </span>
    </button>
  );
}

