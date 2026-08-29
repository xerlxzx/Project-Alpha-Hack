import * as React from "react";

import { cn } from "@/lib/utils";

import styles from "./GlassPanel.module.css";

export interface GlassPanelProps extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * Renders a semi-opaque solid backing layer behind children so text stays
   * legible regardless of what's behind the panel.
   */
  withTextBacking?: boolean;
  /**
   * Enables `will-change: backdrop-filter` during animation. Disable at rest
   * so the browser releases the compositing layer.
   */
  transitioning?: boolean;
}

/**
 * Liquid-glass surface: backdrop blur + saturation + a frosted tint.
 * Do not nest GlassPanels. Stacked translucency
 * compounds blur and opacity and breaks contrast.
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
