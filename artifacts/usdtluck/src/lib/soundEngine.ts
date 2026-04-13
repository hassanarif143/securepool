type SoundName =
  | "tap"
  | "hover"
  | "toggle"
  | "spin-start"
  | "spin-tick"
  | "card-flip"
  | "scratch"
  | "dice-roll"
  | "number-pop"
  | "countdown"
  | "card-deal"
  | "win-small"
  | "win-medium"
  | "win-big"
  | "lose"
  | "near-miss"
  | "cashout"
  | "suspense"
  | "coin-rain";

type ActiveHandle = { stop: () => void };

const LS_KEY_MUTED = "sp_sound_muted_v1";

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

function now(ctx: AudioContext): number {
  return ctx.currentTime;
}

function env(
  gain: GainNode,
  ctx: AudioContext,
  opts: { at: number; peak: number; attackMs: number; decayMs: number; sustain: number; releaseMs: number; durMs: number },
) {
  const t0 = opts.at;
  const a = opts.attackMs / 1000;
  const d = opts.decayMs / 1000;
  const r = opts.releaseMs / 1000;
  const dur = opts.durMs / 1000;

  const peak = Math.max(0, opts.peak);
  const sus = Math.max(0, opts.sustain);

  gain.gain.cancelScheduledValues(t0);
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak), t0 + Math.max(0.001, a));
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, sus), t0 + Math.max(0.001, a + d));
  const tRelease = t0 + Math.max(0.001, dur);
  gain.gain.setValueAtTime(Math.max(0.0001, sus), tRelease);
  gain.gain.exponentialRampToValueAtTime(0.0001, tRelease + Math.max(0.001, r));
}

function makeNoiseBuffer(ctx: AudioContext, seconds: number, type: "white" | "brown"): AudioBuffer {
  const len = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  let lastOut = 0;
  for (let i = 0; i < len; i++) {
    const white = Math.random() * 2 - 1;
    if (type === "white") {
      data[i] = white;
    } else {
      // brown noise (simple integrator)
      lastOut = (lastOut + 0.02 * white) / 1.02;
      data[i] = lastOut * 3.5;
    }
  }
  return buf;
}

function delayedTap(ctx: AudioContext, src: AudioNode, out: AudioNode, delayMs: number, gainDb: number) {
  const d = ctx.createDelay(1.0);
  d.delayTime.value = Math.max(0, delayMs) / 1000;
  const g = ctx.createGain();
  const lin = Math.pow(10, gainDb / 20);
  g.gain.value = lin;
  src.connect(d);
  d.connect(g);
  g.connect(out);
  return () => {
    try {
      src.disconnect(d);
      d.disconnect();
      g.disconnect();
    } catch {
      /* noop */
    }
  };
}

export class SoundEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private active: Map<SoundName, ActiveHandle> = new Map();
  private muted = false;
  private volume = 0.9;
  private listeners = new Set<() => void>();

  constructor() {
    try {
      const raw = localStorage.getItem(LS_KEY_MUTED);
      this.muted = raw === "1";
    } catch {
      this.muted = false;
    }
  }

  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit() {
    for (const fn of this.listeners) fn();
  }

  get isMuted(): boolean {
    return this.muted;
  }

  get masterVolume(): number {
    return this.volume;
  }

  setVolume(v01: number) {
    this.volume = clamp01(v01);
    if (this.master) this.master.gain.value = this.muted ? 0 : this.volume;
    this.emit();
  }

  mute() {
    this.muted = true;
    try {
      localStorage.setItem(LS_KEY_MUTED, "1");
    } catch {
      /* noop */
    }
    if (this.master) this.master.gain.value = 0;
    this.stopAll();
    this.emit();
  }

  unmute() {
    this.muted = false;
    try {
      localStorage.setItem(LS_KEY_MUTED, "0");
    } catch {
      /* noop */
    }
    if (this.master) this.master.gain.value = this.volume;
    this.emit();
  }

  toggleMute() {
    if (this.muted) this.unmute();
    else this.mute();
  }

  /** Must be called from a user gesture (click/tap) at least once. */
  async ensureStarted(): Promise<void> {
    if (this.ctx && this.master) {
      if (this.ctx.state !== "running") await this.ctx.resume();
      return;
    }
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const master = ctx.createGain();
    master.gain.value = this.muted ? 0 : this.volume;
    master.connect(ctx.destination);
    this.ctx = ctx;
    this.master = master;
    if (ctx.state !== "running") await ctx.resume();
  }

  stop(name: SoundName) {
    const h = this.active.get(name);
    if (h) {
      h.stop();
      this.active.delete(name);
    }
  }

  stopAll() {
    for (const [k, h] of this.active.entries()) {
      h.stop();
      this.active.delete(k);
    }
  }

  play(name: SoundName, opts?: { intensity?: number }): void {
    if (this.muted) return;
    void this.ensureStarted().then(() => {
      if (!this.ctx || !this.master) return;
      this.stop(name);
      const h = this.playImpl(name, opts);
      if (h) this.active.set(name, h);
    });
  }

  startContinuous(name: Extract<SoundName, "scratch" | "suspense">, opts?: { intensity?: number }) {
    this.play(name, opts);
  }

  private playImpl(name: SoundName, opts?: { intensity?: number }): ActiveHandle | null {
    const ctx = this.ctx!;
    const master = this.master!;
    const t0 = now(ctx) + 0.005;
    const intensity = clamp01(opts?.intensity ?? 0.6);

    const stopFns: Array<() => void> = [];
    const done = (afterMs: number) => {
      const id = window.setTimeout(() => this.active.delete(name), afterMs);
      stopFns.push(() => window.clearTimeout(id));
    };
    const safeDisconnect = (n: AudioNode) => {
      try {
        n.disconnect();
      } catch {
        /* noop */
      }
    };

    const mkTone = (freqHz: number, type: OscillatorType, durMs: number, gPeak: number, filter?: { type: BiquadFilterType; freq: number; q?: number }) => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(freqHz, t0);
      const g = ctx.createGain();
      const out = filter ? ctx.createBiquadFilter() : null;
      if (out) {
        out.type = filter!.type;
        out.frequency.setValueAtTime(filter!.freq, t0);
        if (filter!.q != null) out.Q.setValueAtTime(filter!.q!, t0);
      }
      env(g, ctx, { at: t0, peak: gPeak, attackMs: 10, decayMs: 60, sustain: 0.0008, releaseMs: 90, durMs });
      o.connect(g);
      if (out) {
        g.connect(out);
        out.connect(master);
      } else {
        g.connect(master);
      }
      o.start(t0);
      o.stop(t0 + durMs / 1000 + 0.25);
      stopFns.push(() => {
        try {
          o.stop();
        } catch {
          /* noop */
        }
        safeDisconnect(o);
        safeDisconnect(g);
        if (out) safeDisconnect(out);
      });
    };

    const mkNoise = (type: "white" | "brown", durMs: number, peak: number, bp?: { freq: number; q?: number }) => {
      const src = ctx.createBufferSource();
      src.buffer = makeNoiseBuffer(ctx, Math.max(0.12, durMs / 1000), type);
      src.loop = false;
      const g = ctx.createGain();
      const f = ctx.createBiquadFilter();
      f.type = "bandpass";
      f.frequency.setValueAtTime(bp?.freq ?? 2000, t0);
      f.Q.setValueAtTime(bp?.q ?? 1.2, t0);
      env(g, ctx, { at: t0, peak, attackMs: 2, decayMs: 40, sustain: 0.0006, releaseMs: 60, durMs });
      src.connect(f);
      f.connect(g);
      g.connect(master);
      src.start(t0);
      src.stop(t0 + durMs / 1000 + 0.2);
      stopFns.push(() => {
        try {
          src.stop();
        } catch {
          /* noop */
        }
        safeDisconnect(src);
        safeDisconnect(g);
        safeDisconnect(f);
      });
    };

    if (name === "tap") {
      mkTone(2000, "sine", 80, 0.22, { type: "lowpass", freq: 5200, q: 0.6 });
      done(250);
    } else if (name === "hover") {
      mkTone(1500, "sine", 50, 0.04, { type: "lowpass", freq: 3500, q: 0.7 });
      done(180);
    } else if (name === "toggle") {
      // two quick notes
      const o1 = ctx.createOscillator();
      const g1 = ctx.createGain();
      o1.type = "sine";
      o1.frequency.setValueAtTime(800, t0);
      env(g1, ctx, { at: t0, peak: 0.12, attackMs: 5, decayMs: 40, sustain: 0.0007, releaseMs: 60, durMs: 55 });
      o1.connect(g1);
      g1.connect(master);
      o1.start(t0);
      o1.stop(t0 + 0.2);

      const o2 = ctx.createOscillator();
      const g2 = ctx.createGain();
      o2.type = "sine";
      o2.frequency.setValueAtTime(1200, t0 + 0.06);
      env(g2, ctx, { at: t0 + 0.06, peak: 0.12, attackMs: 5, decayMs: 40, sustain: 0.0007, releaseMs: 60, durMs: 55 });
      o2.connect(g2);
      g2.connect(master);
      o2.start(t0 + 0.06);
      o2.stop(t0 + 0.25);
      stopFns.push(() => {
        safeDisconnect(o1);
        safeDisconnect(g1);
        safeDisconnect(o2);
        safeDisconnect(g2);
      });
      done(400);
    } else if (name === "spin-start") {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.setValueAtTime(200, t0);
      o.frequency.exponentialRampToValueAtTime(800, t0 + 0.3);
      env(g, ctx, { at: t0, peak: 0.18 + intensity * 0.1, attackMs: 10, decayMs: 220, sustain: 0.03, releaseMs: 120, durMs: 320 });
      o.connect(g);
      g.connect(master);
      // slight noise air
      const noise = ctx.createBufferSource();
      noise.buffer = makeNoiseBuffer(ctx, 0.35, "white");
      const ng = ctx.createGain();
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.setValueAtTime(1200, t0);
      ng.gain.value = 0.03 + intensity * 0.02;
      noise.connect(lp);
      lp.connect(ng);
      ng.connect(master);
      noise.start(t0);
      noise.stop(t0 + 0.4);
      o.start(t0);
      o.stop(t0 + 0.6);
      stopFns.push(() => {
        safeDisconnect(o);
        safeDisconnect(g);
        safeDisconnect(noise);
        safeDisconnect(ng);
        safeDisconnect(lp);
      });
      done(800);
    } else if (name === "spin-tick") {
      mkTone(1400, "square", 18, 0.06 + intensity * 0.06, { type: "bandpass", freq: 2600, q: 0.9 });
      done(160);
    } else if (name === "card-flip") {
      mkNoise("white", 55, 0.12 + intensity * 0.08, { freq: 2200, q: 3.5 });
      done(220);
    } else if (name === "card-deal") {
      mkNoise("white", 55, 0.08 + intensity * 0.05, { freq: 1800, q: 2.8 });
      done(220);
    } else if (name === "scratch") {
      // continuous brown noise through bandpass + lowpass
      const src = ctx.createBufferSource();
      src.buffer = makeNoiseBuffer(ctx, 1.2, "brown");
      src.loop = true;
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 550;
      bp.Q.value = 0.9;
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 1200;
      const g = ctx.createGain();
      g.gain.value = 0.0001;
      env(g, ctx, { at: t0, peak: 0.07 + intensity * 0.08, attackMs: 12, decayMs: 80, sustain: 0.05, releaseMs: 120, durMs: 900 });
      src.connect(bp);
      bp.connect(lp);
      lp.connect(g);
      g.connect(master);
      src.start(t0);
      stopFns.push(() => {
        try {
          src.stop();
        } catch {
          /* noop */
        }
        safeDisconnect(src);
        safeDisconnect(bp);
        safeDisconnect(lp);
        safeDisconnect(g);
      });
    } else if (name === "dice-roll") {
      // 6-8 bursts
      const hits = 6 + Math.floor(Math.random() * 3);
      for (let i = 0; i < hits; i++) {
        const at = t0 + (i * 0.4) / hits;
        const src = ctx.createBufferSource();
        src.buffer = makeNoiseBuffer(ctx, 0.08, "white");
        const bp = ctx.createBiquadFilter();
        bp.type = "bandpass";
        bp.frequency.setValueAtTime(800 + Math.random() * 900, at);
        bp.Q.value = 1.1;
        const g = ctx.createGain();
        env(g, ctx, { at, peak: 0.07, attackMs: 2, decayMs: 30, sustain: 0.0007, releaseMs: 60, durMs: 45 });
        src.connect(bp);
        bp.connect(g);
        g.connect(master);
        src.start(at);
        src.stop(at + 0.15);
        stopFns.push(() => {
          safeDisconnect(src);
          safeDisconnect(bp);
          safeDisconnect(g);
        });
      }
      done(700);
    } else if (name === "number-pop") {
      // caller should set intensity; we translate to pitch
      const base = 650 + Math.round(500 * intensity);
      mkTone(base, "sine", 120, 0.08 + intensity * 0.07, { type: "lowpass", freq: 5400, q: 0.6 });
      done(260);
    } else if (name === "countdown") {
      mkTone(1000, "sine", 55, 0.08, { type: "bandpass", freq: 1800, q: 1.0 });
      done(220);
    } else if (name === "win-small") {
      // C5 E5 G5
      const notes = [523.25, 659.25, 783.99];
      notes.forEach((f, i) => mkTone(f, "sine", 120, 0.11, { type: "lowpass", freq: 5200, q: 0.7 }));
      done(700);
    } else if (name === "win-medium") {
      const notes = [261.63, 329.63, 392.0, 523.25, 659.25];
      const mix = ctx.createGain();
      mix.gain.value = 1;
      mix.connect(master);
      const g = ctx.createGain();
      g.gain.value = 0.16;
      g.connect(mix);
      const o = ctx.createOscillator();
      o.type = "sine";
      const o2 = ctx.createOscillator();
      o2.type = "triangle";
      o.connect(g);
      o2.connect(g);
      o.start(t0);
      o2.start(t0);
      // arpeggio by ramping freq
      notes.forEach((f, i) => {
        const at = t0 + i * 0.12;
        o.frequency.setValueAtTime(f, at);
        o2.frequency.setValueAtTime(f, at);
      });
      const eg = ctx.createGain();
      eg.gain.value = 0.0001;
      env(eg, ctx, { at: t0, peak: 0.28, attackMs: 10, decayMs: 420, sustain: 0.06, releaseMs: 260, durMs: 800 });
      g.disconnect();
      o.connect(eg);
      o2.connect(eg);
      eg.connect(mix);
      const undoDelay = delayedTap(ctx, eg, master, 80, -12);
      stopFns.push(() => undoDelay());
      o.stop(t0 + 1.6);
      o2.stop(t0 + 1.6);
      stopFns.push(() => {
        safeDisconnect(o);
        safeDisconnect(o2);
        safeDisconnect(eg);
        safeDisconnect(mix);
      });
      done(1800);
    } else if (name === "win-big") {
      // ascending scale + shimmer
      const scale = [261.63, 293.66, 329.63, 349.23, 392.0, 440.0, 493.88, 523.25];
      const o = ctx.createOscillator();
      o.type = "sine";
      const g = ctx.createGain();
      g.gain.value = 0.0001;
      env(g, ctx, { at: t0, peak: 0.32, attackMs: 10, decayMs: 900, sustain: 0.11, releaseMs: 1200, durMs: 1600 });
      o.connect(g);
      g.connect(master);
      scale.forEach((f, i) => {
        const at = t0 + i * 0.10;
        o.frequency.setValueAtTime(f, at);
      });
      // shimmer overlay
      const sh = ctx.createOscillator();
      sh.type = "sine";
      sh.frequency.setValueAtTime(8200, t0);
      const shGain = ctx.createGain();
      shGain.gain.value = 0.0001;
      env(shGain, ctx, { at: t0 + 0.15, peak: 0.06, attackMs: 30, decayMs: 700, sustain: 0.03, releaseMs: 1200, durMs: 1600 });
      // tremolo
      const lfo = ctx.createOscillator();
      lfo.type = "sine";
      lfo.frequency.setValueAtTime(7, t0);
      const lfoGain = ctx.createGain();
      lfoGain.gain.setValueAtTime(0.5, t0);
      lfo.connect(lfoGain);
      lfoGain.connect(shGain.gain);
      sh.connect(shGain);
      shGain.connect(master);

      const undoDelay = delayedTap(ctx, g, master, 80, -12);
      o.start(t0);
      sh.start(t0);
      lfo.start(t0);
      o.stop(t0 + 3.4);
      sh.stop(t0 + 3.4);
      lfo.stop(t0 + 3.4);
      stopFns.push(() => {
        undoDelay();
        safeDisconnect(o);
        safeDisconnect(g);
        safeDisconnect(sh);
        safeDisconnect(shGain);
        safeDisconnect(lfo);
        safeDisconnect(lfoGain);
      });
      done(3600);
    } else if (name === "lose") {
      // gentle descending E4 -> C4 triangle
      const o = ctx.createOscillator();
      o.type = "triangle";
      const g = ctx.createGain();
      g.gain.value = 0.0001;
      env(g, ctx, { at: t0, peak: 0.14, attackMs: 20, decayMs: 180, sustain: 0.03, releaseMs: 220, durMs: 300 });
      o.frequency.setValueAtTime(329.63, t0);
      o.frequency.exponentialRampToValueAtTime(261.63, t0 + 0.18);
      o.connect(g);
      g.connect(master);
      o.start(t0);
      o.stop(t0 + 1.0);
      stopFns.push(() => {
        safeDisconnect(o);
        safeDisconnect(g);
      });
      done(1200);
    } else if (name === "near-miss") {
      // sustained D4 with vibrato
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.setValueAtTime(293.66, t0);
      const g = ctx.createGain();
      g.gain.value = 0.0001;
      env(g, ctx, { at: t0, peak: 0.12, attackMs: 30, decayMs: 120, sustain: 0.08, releaseMs: 220, durMs: 800 });
      const lfo = ctx.createOscillator();
      lfo.type = "sine";
      lfo.frequency.setValueAtTime(4, t0);
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 20;
      lfo.connect(lfoGain);
      lfoGain.connect(o.frequency);
      o.connect(g);
      g.connect(master);
      o.start(t0);
      lfo.start(t0);
      o.stop(t0 + 1.4);
      lfo.stop(t0 + 1.4);
      stopFns.push(() => {
        safeDisconnect(o);
        safeDisconnect(g);
        safeDisconnect(lfo);
        safeDisconnect(lfoGain);
      });
      done(1600);
    } else if (name === "cashout") {
      // win-medium + overtone
      this.playImpl("win-medium", { intensity });
      mkTone(2600, "sine", 220, 0.04 + intensity * 0.02, { type: "bandpass", freq: 3600, q: 1.2 });
      done(900);
    } else if (name === "suspense") {
      // low rumble with slow AM (continuous-ish)
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.setValueAtTime(60, t0);
      const g = ctx.createGain();
      g.gain.value = 0.0001;
      env(g, ctx, { at: t0, peak: 0.06 + intensity * 0.05, attackMs: 80, decayMs: 400, sustain: 0.05, releaseMs: 280, durMs: 2000 });
      // AM
      const lfo = ctx.createOscillator();
      lfo.type = "sine";
      lfo.frequency.setValueAtTime(0.5, t0);
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 0.35;
      lfo.connect(lfoGain);
      lfoGain.connect(g.gain);
      o.connect(g);
      g.connect(master);
      o.start(t0);
      lfo.start(t0);
      o.stop(t0 + 2.6);
      lfo.stop(t0 + 2.6);
      stopFns.push(() => {
        safeDisconnect(o);
        safeDisconnect(g);
        safeDisconnect(lfo);
        safeDisconnect(lfoGain);
      });
      done(2800);
    } else if (name === "coin-rain") {
      // metallic randomized pings 2-3s
      const durMs = 2200 + Math.round(900 * intensity);
      const start = t0;
      const end = start + durMs / 1000;
      const every = 0.055;
      for (let at = start; at < end; at += every) {
        const f = 3000 + Math.random() * 2200;
        const o = ctx.createOscillator();
        o.type = "sine";
        o.frequency.setValueAtTime(f, at);
        const g = ctx.createGain();
        env(g, ctx, { at, peak: 0.018 + Math.random() * 0.02, attackMs: 1, decayMs: 18, sustain: 0.0007, releaseMs: 40, durMs: 18 });
        const bp = ctx.createBiquadFilter();
        bp.type = "bandpass";
        bp.frequency.setValueAtTime(f, at);
        bp.Q.value = 2.8;
        o.connect(bp);
        bp.connect(g);
        g.connect(master);
        o.start(at);
        o.stop(at + 0.2);
        stopFns.push(() => {
          safeDisconnect(o);
          safeDisconnect(bp);
          safeDisconnect(g);
        });
      }
      done(durMs + 400);
    } else {
      return null;
    }

    return {
      stop: () => {
        for (const fn of stopFns) fn();
      },
    };
  }
}

let singleton: SoundEngine | null = null;
export function getSoundEngine(): SoundEngine {
  if (!singleton) singleton = new SoundEngine();
  return singleton;
}

export type { SoundName };

