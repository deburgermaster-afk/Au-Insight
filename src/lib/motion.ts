import type { Transition } from "motion/react";

/** Shared springs so every animation in the app feels the same. */
export const spring = {
  snappy: { type: "spring", stiffness: 520, damping: 38, mass: 0.8 },
  soft: { type: "spring", stiffness: 260, damping: 30, mass: 0.9 },
  gentle: { type: "spring", stiffness: 160, damping: 26 },
} satisfies Record<string, Transition>;

export const fadeUp = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
  transition: spring.soft,
};
