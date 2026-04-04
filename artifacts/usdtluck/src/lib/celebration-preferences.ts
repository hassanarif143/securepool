const KEY_EFFECTS = "securepool_celebration_effects";
const KEY_SOUND = "securepool_celebration_sound";
const KEY_SEEN_NOTIFS = "securepool_celebration_seen_notif_ids";

export function getCelebrationEffectsEnabled(): boolean {
  if (typeof window === "undefined") return true;
  const v = localStorage.getItem(KEY_EFFECTS);
  if (v === null) return true;
  return v === "1" || v === "true";
}

export function setCelebrationEffectsEnabled(on: boolean): void {
  localStorage.setItem(KEY_EFFECTS, on ? "1" : "0");
  window.dispatchEvent(new CustomEvent("celebration-prefs-changed"));
}

export function getCelebrationSoundEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(KEY_SOUND) === "1";
}

export function setCelebrationSoundEnabled(on: boolean): void {
  localStorage.setItem(KEY_SOUND, on ? "1" : "0");
  window.dispatchEvent(new CustomEvent("celebration-prefs-changed"));
}

export function subscribeCelebrationPrefs(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const fn = () => cb();
  window.addEventListener("celebration-prefs-changed", fn);
  return () => window.removeEventListener("celebration-prefs-changed", fn);
}

export function getSeenCelebrationNotificationIds(): Set<number> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(KEY_SEEN_NOTIFS);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as number[];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

export function markCelebrationNotificationSeen(id: number): void {
  const s = getSeenCelebrationNotificationIds();
  s.add(id);
  const arr = [...s].slice(-200);
  localStorage.setItem(KEY_SEEN_NOTIFS, JSON.stringify(arr));
}
