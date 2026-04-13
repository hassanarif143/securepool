import type { Variants } from "framer-motion";

export const pageEnter: Variants = {
  initial: { opacity: 0, y: 20 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { type: "spring", stiffness: 300, damping: 30 },
  },
  exit: { opacity: 0, y: -10, transition: { duration: 0.2 } },
};

export const scaleIn: Variants = {
  initial: { scale: 0.85, opacity: 0 },
  animate: {
    scale: 1,
    opacity: 1,
    transition: { type: "spring", stiffness: 320, damping: 26 },
  },
  exit: { scale: 0.96, opacity: 0, transition: { duration: 0.18 } },
};

export const cardFlip: Variants = {
  initial: { rotateY: 0 },
  animate: { rotateY: 180, transition: { duration: 0.6, ease: "easeInOut" } },
};

export const shakeX: Variants = {
  animate: { x: [0, -8, 8, -6, 6, -3, 3, 0], transition: { duration: 0.5 } },
};

export const shakeY: Variants = {
  animate: { y: [0, -8, 8, -6, 6, -3, 3, 0], transition: { duration: 0.5 } },
};

export const pulseGlow: Variants = {
  animate: {
    scale: [1, 1.05, 1],
    boxShadow: [
      "0 0 0 rgba(0,0,0,0)",
      "0 0 28px rgba(0,229,204,0.22)",
      "0 0 0 rgba(0,0,0,0)",
    ],
    transition: { duration: 1.5, repeat: Infinity },
  },
};

export const floatUp: Variants = {
  initial: { y: 0, opacity: 1 },
  animate: { y: -60, opacity: 0, transition: { duration: 1.2 } },
};

export const staggerParent: Variants = {
  animate: { transition: { staggerChildren: 0.08, delayChildren: 0.1 } },
};

export const rubberBand: Variants = {
  animate: {
    scaleX: [1, 1.25, 0.75, 1.15, 0.95, 1],
    transition: { duration: 0.6 },
  },
};

export const bounceIn: Variants = {
  initial: { scale: 0.82, opacity: 0, y: 6 },
  animate: {
    scale: 1,
    opacity: 1,
    y: 0,
    transition: { type: "spring", stiffness: 400, damping: 15 },
  },
  exit: { opacity: 0, scale: 0.97, transition: { duration: 0.16 } },
};

export const slideUp: Variants = {
  initial: { y: "100%" },
  animate: { y: 0, transition: { type: "spring", stiffness: 320, damping: 25 } },
  exit: { y: "110%", transition: { duration: 0.2 } },
};

