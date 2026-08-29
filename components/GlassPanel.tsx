import * as React from "react";

import { cn } from "@/lib/utils";

import styles from "./GlassPanel.module.css";

export interface GlassPanelProps extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * Renders a semi-opaque solid backing layer behind children, so text sitting
   * on the glass stays legible regardless of what's behind the panel (see
   * DESIGN_DIRECTION.md's dark-mode contrast note).
   */
  withTextBacking?: boolean;
  /**
   * Set true only while the panel is actively animating (e.g. a sheet
   * sliding in) to opt into `will-change: backdrop-filter`; leave false at
   * rest so the browser isn't holding a compositing layer permanently.
   */
  transitioning?: boolean;
}

/**
 * The Liquid-Glass surface recipe from DESIGN_DIRECTION.md ("Surface
 * material — Liquid Glass, scoped"). Reserved for chrome/hero surfaces ONLY:
 * bottom sheets, modals, the agent-progress overlay, and the nav bar.
 * Data-dense surfaces (venue cards, group cards, chat, list rows, forms) use
 * flat premium surfaces instead — do not reach for this component there.
 *
 * Do not nest a GlassPanel inside another GlassPanel: stacked translucency
 * compounds blur and opacity and breaks the contrast guarantees this recipe
 * relies on.
 */
export const GlassPanel = React.forwardRef<HTMLDivElement, GlassPanelProps>(
  (
    { className, children, withTextBacking, transitioning, style, ...props },
    ref,
  ) => {
    return (
      <div
        ref={ref}
        className={cn(
          "relative isolate rounded-2xl",
          "backdrop-blur-xl backdrop-saturate-150",
          "bg-white/10 dark:bg-white/5",
          "border border-white/20 dark:border-white/10",
          "shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]",
          styles.glass,
          className,
        )}
        style={{
          ...(transitioning ? { willChange: "backdrop-filter" } : null),
          ...style,
        }}
        {...props}
      >
        {withTextBacking && (
          <div
            aria-hidden
            className="absolute inset-0 -z-10 rounded-2xl bg-surface/70 dark:bg-surface/60"
          />
        )}
        {children}
      </div>
    );
  },
);
GlassPanel.displayName = "GlassPanel";
