import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import { getSoundEngine, type SoundName } from "@/lib/soundEngine";

function subscribe(cb: () => void) {
  return getSoundEngine().subscribe(cb);
}

function getSnapshot() {
  return getSoundEngine().getSnapshot();
}

function getServerSnapshot() {
  return { muted: true, volume: 0 };
}

export function useSound() {
  const snap = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const engine = useMemo(() => getSoundEngine(), []);

  // Try to keep context warm after a user gesture without forcing sound.
  useEffect(() => {
    const onFirst = () => {
      void engine.ensureStarted();
      window.removeEventListener("pointerdown", onFirst);
      window.removeEventListener("keydown", onFirst);
    };
    window.addEventListener("pointerdown", onFirst, { passive: true });
    window.addEventListener("keydown", onFirst);
    return () => {
      window.removeEventListener("pointerdown", onFirst);
      window.removeEventListener("keydown", onFirst);
    };
  }, [engine]);

  const play = useCallback(
    (name: SoundName, opts?: { intensity?: number }) => {
      engine.play(name, opts);
    },
    [engine],
  );

  const stop = useCallback(
    (name: SoundName) => {
      engine.stop(name);
    },
    [engine],
  );

  const toggleMute = useCallback(() => engine.toggleMute(), [engine]);

  return {
    play,
    stop,
    isMuted: snap.muted,
    volume: snap.volume,
    setVolume: (v: number) => engine.setVolume(v),
    toggleMute,
    mute: () => engine.mute(),
    unmute: () => engine.unmute(),
  };
}

