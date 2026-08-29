"use client";

import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

import { cn } from "@/lib/utils";
import { spring, ease } from "./tokens";

const CATEGORICAL = [
  "var(--cat-blue)",
  "var(--cat-sage)",
  "var(--cat-clay)",
  "var(--cat-plum)",
  "var(--cat-teal)",
  "var(--accent)",
];

// Deterministic particle field so SSR and client agree (no Math.random at render).
const PARTICLES = Array.from({ length: 16 }, (_, i) => {
  const angle = (i / 16) * Math.PI * 2 + (i % 2 ? 0.2 : -0.2);
  const distance = 70 + (i % 4) * 22;
  return {
    id: i,
    x: Math.cos(angle) * distance,
    y: Math.sin(angle) * distance,
    color: CATEGORICAL[i % CATEGORICAL.length],
    size: 6 + (i % 3) * 3,
    delay: (i % 5) * 0.02,
  };
});

export interface FeedbackBurstProps {
  /** Toggle to fire the celebration. */
  show: boolean;
  /** Called ~1.6s after firing so the parent can reset `show`. */
  onDone?: () => void;
  /** Headline under the check, e.g. "Locked in". */
  message?: string;
  /** Small supporting line, e.g. "See you Saturday". */
  detail?: string;
  className?: string;
}

/**
 * Reward animation for confirmation. A checkmark springs in over expanding amber
 * shockwaves while categorical confetti bursts outward. Render it inside a
 * `relative` container; it fills the parent and ignores pointer events.
 *
 * Rings and particles animate transform/opacity only.
 */
export function FeedbackBurst({
  show,
  onDone,
  message = "Locked in",
  detail,
  className,
}: FeedbackBurstProps) {
  const reduce = useReducedMotion();

  React.useEffect(() => {
    if (!show) return;
    const t = setTimeout(() => onDone?.(), reduce ? 900 : 1700);
    return () => clearTimeout(t);
  }, [show, onDone, reduce]);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className={cn(
            "pointer-events-none absolute inset-0 z-30 grid place-items-center",
            className,
          )}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.3 } }}
        >
          <div className="relative grid place-items-center">
            {/* Expanding shockwave rings */}
            {!reduce &&
              [0, 1, 2].map((i) => (
                <motion.span
                  key={i}
                  className="absolute h-24 w-24 rounded-full border-2 border-[var(--accent)]"
                  initial={{ scale: 0.4, opacity: 0.6 }}
                  animate={{ scale: 2.6 + i * 0.6, opacity: 0 }}
                  transition={{
                    duration: 1.1,
                    delay: 0.05 + i * 0.12,
                    ease: ease.out,
                  }}
                />
              ))}

            {/* Confetti */}
            {!reduce &&
              PARTICLES.map((p) => (
                <motion.span
                  key={p.id}
                  className="absolute rounded-full"
                  style={{
                    width: p.size,
                    height: p.size,
                    backgroundColor: p.color,
                  }}
                  initial={{ x: 0, y: 0, scale: 0, opacity: 0 }}
                  animate={{
                    x: p.x,
                    y: p.y,
                    scale: [0, 1, 0.9],
                    opacity: [0, 1, 0],
                  }}
                  transition={{
                    duration: 1.1,
                    delay: 0.1 + p.delay,
                    ease: ease.out,
                  }}
                />
              ))}

            {/* Check medallion */}
            <motion.div
              className="relative grid h-24 w-24 place-items-center rounded-full bg-[var(--accent)] text-[var(--accent-foreground)] shadow-lg shadow-[var(--accent)]/30"
              initial={{ scale: 0, rotate: reduce ? 0 : -25 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={reduce ? { duration: 0.2 } : spring.bouncy}
            >
              <svg width="44" height="44" viewBox="0 0 24 24" fill="none" aria-hidden>
                <motion.path
                  d="M4 12.5l5 5L20 6.5"
                  stroke="currentColor"
                  strokeWidth={2.6}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={
                    reduce
                      ? { duration: 0 }
                      : { duration: 0.4, delay: 0.18, ease: ease.out }
                  }
                />
              </svg>
            </motion.div>

            {/* Copy */}
            {(message || detail) && (
              <motion.div
                className="absolute top-full mt-5 w-max max-w-[16rem] text-center"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: reduce ? 0.1 : 0.35, ...spring.gentle }}
              >
                <div className="font-display text-xl font-semibold text-foreground">
                  {message}
                </div>
                {detail && (
                  <div className="mt-0.5 text-sm text-muted-foreground">
                    {detail}
                  </div>
                )}
              </motion.div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
