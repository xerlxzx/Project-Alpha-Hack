"use client";

import * as React from "react";
import {
  motion,
  useMotionValue,
  useReducedMotion,
  animate,
} from "framer-motion";

import { cn } from "@/lib/utils";
import { spring, ease } from "./tokens";

export interface MomentumRingProps {
  /** Weekly goal completion from 0 to 1. */
  progress: number;
  /** Diameter in px. */
  size?: number;
  /** Stroke thickness in px. */
  thickness?: number;
  /** Big number in the middle (defaults to the progress percentage). */
  label?: React.ReactNode;
  /** Small caption beneath the number. */
  caption?: string;
  /** Animate the fill in on mount / progress change. */
  animateOnChange?: boolean;
  className?: string;
}

/**
 * Apple Activity-style closing ring. The arc springs closed, a luminous tip
 * rides the leading edge, and the center number counts up in step.
 *
 * A separate blurred layer pulses the tip glow. Ring geometry animates only
 * stroke and transform to avoid filter re-renders.
 */
export function MomentumRing({
  progress,
  size = 240,
  thickness = 18,
  label,
  caption,
  animateOnChange = true,
  className,
}: MomentumRingProps) {
  const reduce = useReducedMotion();
  const clamped = Math.max(0, Math.min(1, progress));

  const r = (size - thickness) / 2;
  const cx = size / 2;
  const circumference = 2 * Math.PI * r;

  // Count-up number driven by a motion value.
  const count = useMotionValue(0);
  const [display, setDisplay] = React.useState(0);

  React.useEffect(() => {
    const unsub = count.on("change", (v) => setDisplay(Math.round(v)));
    if (reduce || !animateOnChange) {
      count.set(clamped * 100);
    } else {
      const controls = animate(count, clamped * 100, {
        duration: 1.1,
        ease: ease.out,
        delay: 0.15,
      });
      return () => {
        controls.stop();
        unsub();
      };
    }
    return unsub;
  }, [clamped, reduce, animateOnChange, count]);

  // Angle of the leading tip, in degrees from the top.
  const tipAngle = clamped * 360;

  return (
    <div
      className={cn("relative inline-grid place-items-center", className)}
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90"
        aria-hidden
      >
        <defs>
          <linearGradient id="momentum-ring" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="var(--accent-active)" />
            <stop offset="55%" stopColor="var(--accent)" />
            <stop offset="100%" stopColor="var(--accent-hover)" />
          </linearGradient>
        </defs>

        {/* Track */}
        <circle
          cx={cx}
          cy={cx}
          r={r}
          fill="none"
          strokeWidth={thickness}
          className="stroke-black/[0.06] dark:stroke-white/10"
        />

        {/* Progress arc */}
        <motion.circle
          cx={cx}
          cy={cx}
          r={r}
          fill="none"
          stroke="url(#momentum-ring)"
          strokeWidth={thickness}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{
            strokeDashoffset:
              reduce || !animateOnChange
                ? circumference * (1 - clamped)
                : circumference * (1 - clamped),
          }}
          transition={reduce ? { duration: 0 } : { ...spring.soft, delay: 0.15 }}
        />
      </svg>

      {/* Luminous leading tip. Rotation only. */}
      {clamped > 0.02 && (
        <motion.div
          className="pointer-events-none absolute inset-0"
          initial={{ rotate: 0 }}
          animate={{ rotate: tipAngle }}
          transition={reduce ? { duration: 0 } : { ...spring.soft, delay: 0.15 }}
          style={{ transformOrigin: "50% 50%" }}
        >
          <div
            className="absolute left-1/2 top-0 -translate-x-1/2"
            style={{ transform: `translateY(${thickness / 2}px)` }}
          >
            {/* Solid tip */}
            <div
              className="rounded-full bg-[var(--accent-hover)]"
              style={{ width: thickness - 4, height: thickness - 4 }}
            />
            {/* Pulsing glow. Opacity only. */}
            {!reduce && (
              <motion.div
                aria-hidden
                className="absolute inset-0 rounded-full bg-[var(--accent)] blur-md"
                animate={{ opacity: [0.35, 0.9, 0.35], scale: [1, 1.5, 1] }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  ease: ease.inOut,
                }}
              />
            )}
          </div>
        </motion.div>
      )}

      {/* Center readout */}
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <div className="font-display text-4xl font-semibold tabular-nums leading-none text-foreground">
            {label ?? (
              <>
                {display}
                <span className="text-2xl text-muted-foreground">%</span>
              </>
            )}
          </div>
          {caption && (
            <div className="mt-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {caption}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
