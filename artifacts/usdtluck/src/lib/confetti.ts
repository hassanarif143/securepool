import confetti from "canvas-confetti";

type ConfettiFn = typeof confetti;

function c(): ConfettiFn {
  return confetti;
}

function colors(...hex: string[]) {
  return hex;
}

export const ConfettiPresets = {
  smallWin() {
    return c()({
      particleCount: 50,
      spread: 60,
      origin: { x: 0.5, y: 0.45 },
      colors: colors("#00c853", "#00e5ff", "#ffffff"),
    });
  },
  bigWin() {
    const base = {
      particleCount: 150,
      spread: 90,
      origin: { x: 0.5, y: 0.45 },
      colors: colors("#FFD700", "#00c853", "#ffffff", "#00e5ff"),
    } as const;
    void c()({ ...base, particleCount: 90 });
    return c()({ ...base, particleCount: 60, startVelocity: 55 });
  },
  jackpot() {
    const end = Date.now() + 4000;
    const tick = () => {
      c()({
        particleCount: 10,
        spread: 80,
        startVelocity: 55,
        origin: { x: Math.random(), y: 0 },
        colors: colors("#FFD700", "#00e5ff", "#00c853", "#ff5cf6", "#ffffff"),
      });
      if (Date.now() < end) requestAnimationFrame(tick);
    };
    tick();
  },
  coinBurst() {
    return c()({
      particleCount: 80,
      spread: 70,
      gravity: 1.2,
      origin: { x: 0.5, y: 0.5 },
      colors: colors("#FFD700"),
    });
  },
  sideCannons() {
    void c()({
      particleCount: 70,
      spread: 70,
      angle: 60,
      origin: { x: 0.02, y: 0.95 },
      colors: colors("#FFD700", "#00e5ff", "#00c853", "#ffffff"),
    });
    return c()({
      particleCount: 70,
      spread: 70,
      angle: 120,
      origin: { x: 0.98, y: 0.95 },
      colors: colors("#FFD700", "#00e5ff", "#00c853", "#ffffff"),
    });
  },
};

