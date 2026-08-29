"use client";

import * as React from "react";
import Image from "next/image";
import { motion, useReducedMotion } from "framer-motion";

import { cn } from "@/lib/utils";
import { ease } from "./tokens";

export interface PaperFrameProps {
  src: string;
  alt: string;
  width: number;
  height: number;
  priority?: boolean;
  sizes?: string;
  /** Slow parallax-style float at rest. */
  float?: boolean;
  className?: string;
}

/**
 * Presents a cream-ground illustration as a deliberate "paper" card so it reads
 * as intentional in both themes (the raw cream would otherwise glow on a dark
 * page). Rounded, bordered, on `--surface`, gently dimmed in dark mode, with an
 * optional slow float. Float is transform-only and disabled for reduced motion.
 */
export function PaperFrame({
  src,
  alt,
  width,
  height,
  priority,
  sizes,
  float = true,
  className,
}: PaperFrameProps) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={cn(
        "relative overflow-hidden rounded-[2rem] border border-border bg-surface",
        "shadow-[0_1px_0_rgba(255,255,255,0.6)_inset,0_20px_50px_-24px_rgba(0,0,0,0.35)]",
        "dark:brightness-[0.9]",
        className,
      )}
      animate={
        float && !reduce ? { y: [0, -10, 0] } : undefined
      }
      transition={{ duration: 6, repeat: Infinity, ease: ease.inOut }}
    >
      <Image
        src={src}
        alt={alt}
        width={width}
        height={height}
        priority={priority}
        sizes={sizes}
        className="h-full w-full object-cover"
      />
      {/* Faint amber floor-glow to seat the illustration in the brand */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-[var(--accent)]/8 to-transparent" />
    </motion.div>
  );
}
