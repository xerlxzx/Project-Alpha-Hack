"use client";

import * as React from "react";
import { motion, useReducedMotion } from "framer-motion";

import { cn } from "@/lib/utils";
import { spring, ease } from "./tokens";

export interface PrimaryCTAProps
  extends Omit<React.ComponentPropsWithoutRef<typeof motion.button>, "ref"> {
  children: React.ReactNode;
  /** Show the slow idle glow breathing behind the button. */
  glow?: boolean;
}

/**
 * Primary action button for "Lock me in" and "Accept". Presses in with spring
 * physics, a light sweep crosses on hover, and an optional glow breathes
 * underneath. The glow is a separate blurred layer animating opacity only,
 * so it never repaints the button.
 */
export const PrimaryCTA = React.forwardRef<HTMLButtonElement, PrimaryCTAProps>(
  ({ children, glow = true, className, ...props }, ref) => {
    const reduce = useReducedMotion();
    return (
      <div className="relative inline-grid">
        {glow && !reduce && (
          <motion.span
            aria-hidden
            className="absolute -inset-1 -z-10 rounded-full bg-[var(--accent)] blur-xl"
            animate={{ opacity: [0.25, 0.5, 0.25], scale: [0.96, 1.02, 0.96] }}
            transition={{ duration: 3.2, repeat: Infinity, ease: ease.inOut }}
          />
        )}
        <motion.button
          ref={ref}
          className={cn(
            "group relative isolate overflow-hidden rounded-full",
            "bg-[var(--accent)] px-7 py-3.5 text-base font-semibold text-[var(--accent-foreground)]",
            "shadow-lg shadow-[var(--accent)]/25 outline-none",
            "focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            className,
          )}
          whileHover={reduce ? undefined : { y: -2 }}
          whileTap={reduce ? undefined : { scale: 0.96, y: 0 }}
          transition={spring.snappy}
          {...props}
        >
          {/* Hover light sweep. Transform only. */}
          {!reduce && (
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/40 to-transparent transition-transform duration-700 ease-out group-hover:translate-x-full"
            />
          )}
          <span className="relative z-10 flex items-center justify-center gap-2">
            {children}
          </span>
        </motion.button>
      </div>
    );
  },
);
PrimaryCTA.displayName = "PrimaryCTA";
