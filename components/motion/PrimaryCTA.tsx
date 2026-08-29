"use client";

import * as React from "react";
import { motion, useReducedMotion } from "framer-motion";

import { cn } from "@/lib/utils";
import { spring } from "./tokens";

export interface PrimaryCTAProps
  extends Omit<React.ComponentPropsWithoutRef<typeof motion.button>, "ref"> {
  children: React.ReactNode;
  /**
   * Deprecated. Kept for call-site compatibility; no longer renders a glow.
   * The idle breathing glow was removed; primary buttons stay calm at rest.
   */
  glow?: boolean;
  /**
   * Stretch the button to fill its container instead of hugging its content.
   * The wrapper is `inline-grid` by default (a content-width pill); this makes
   * it a full-width block so `className="w-full"` spans the row.
   */
  fullWidth?: boolean;
}

/**
 * Primary action button for "Lock me in" and "Accept". Presses in with spring
 * physics and lifts slightly on hover. No idle pulsing or shimmer; motion
 * happens only in response to the user's touch.
 */
export const PrimaryCTA = React.forwardRef<HTMLButtonElement, PrimaryCTAProps>(
  ({ children, glow: _glow, fullWidth, className, ...props }, ref) => {
    const reduce = useReducedMotion();
    return (
      <div className={cn("relative", fullWidth ? "grid w-full" : "inline-grid")}>
        <motion.button
          ref={ref}
          className={cn(
            "group relative isolate flex h-14 items-center justify-center overflow-hidden rounded-full",
            "bg-[var(--accent)] px-8 text-base font-semibold text-[var(--accent-foreground)]",
            "shadow-lg shadow-[var(--accent)]/25 outline-none",
            "focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            className,
          )}
          whileHover={reduce ? undefined : { y: -2 }}
          whileTap={reduce ? undefined : { scale: 0.96, y: 0 }}
          transition={spring.snappy}
          {...props}
        >
          <span className="relative z-10 flex items-center justify-center gap-2">
            {children}
          </span>
        </motion.button>
      </div>
    );
  },
);
PrimaryCTA.displayName = "PrimaryCTA";
