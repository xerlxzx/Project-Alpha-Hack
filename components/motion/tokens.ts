import type { Transition } from "framer-motion";

/**
 * Shared motion vocabulary. A single source for springs and easings keeps
 * the app's motion feeling like one designed system.
 *
 * Rule for anything that loops forever (glow pulses, shimmers, ring tips):
 * animate only `transform` / `opacity`. Never loop `box-shadow`, `filter`, or
 * `backdrop-filter`. Put those on a dedicated layer and cross-fade its opacity.
 */

export const spring = {
  /** Everyday UI motion: entrances, layout shifts. Calm, no overshoot. */
  gentle: { type: "spring", stiffness: 130, damping: 20, mass: 0.9 },
  /** Buttons, toggles, small state flips. Quick with a touch of life. */
  snappy: { type: "spring", stiffness: 320, damping: 24 },
  /** Hero reveals. Slow, luxurious settle. */
  soft: { type: "spring", stiffness: 90, damping: 22, mass: 1.1 },
  /** Celebratory pops: checkmarks, badges. Visible overshoot. */
  bouncy: { type: "spring", stiffness: 460, damping: 14 },
} satisfies Record<string, Transition>;

/** Expressive tween easings for tween-based (non-spring) motion. */
export const ease = {
  /** easeOutExpo-style. Decisive arrivals. */
  out: [0.22, 1, 0.36, 1],
  /** Smooth in-and-out for loops and sweeps. */
  inOut: [0.65, 0, 0.35, 1],
} as const;

/** Staggered-reveal helpers so sequences share one cadence. */
export const stagger = (delayChildren = 0.05, staggerChildren = 0.07) => ({
  hidden: {},
  show: {
    transition: { delayChildren, staggerChildren },
  },
});

/** A single item inside a staggered container. Rises and fades in. */
export const riseItem = {
  hidden: { opacity: 0, y: 18, filter: "blur(6px)" },
  show: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: spring.gentle,
  },
};
