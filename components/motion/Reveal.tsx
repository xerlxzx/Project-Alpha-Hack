"use client";

import * as React from "react";
import { motion, useReducedMotion, type Variants } from "framer-motion";

import { spring } from "./tokens";

export interface RevealProps {
  /** Stagger delay before this element animates in. */
  delay?: number;
  /** Direction the element rises/slides from. */
  from?: "bottom" | "left" | "right" | "scale";
  as?: "div" | "section" | "li";
  className?: string;
  style?: React.CSSProperties;
  id?: string;
  children?: React.ReactNode;
}

const offset: Record<NonNullable<RevealProps["from"]>, Record<string, number>> = {
  bottom: { y: 26 },
  left: { x: -26 },
  right: { x: 26 },
  scale: { scale: 0.94 },
};

/**
 * Scroll-triggered reveal — the workhorse for the choreographed page. Rises and
 * unblurs into place once, when scrolled into view. Collapses to a plain fade
 * (or nothing) under `prefers-reduced-motion`.
 */
export function Reveal({
  delay = 0,
  from = "bottom",
  as = "div",
  children,
  className,
  style,
  id,
}: RevealProps) {
  const reduce = useReducedMotion();
  const MotionTag = motion[as] as typeof motion.div;

  const variants: Variants = {
    hidden: reduce
      ? { opacity: 0 }
      : { opacity: 0, filter: "blur(8px)", ...offset[from] },
    show: {
      opacity: 1,
      x: 0,
      y: 0,
      scale: 1,
      filter: "blur(0px)",
      transition: reduce ? { duration: 0.3 } : { ...spring.gentle, delay },
    },
  };

  return (
    <MotionTag
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-12% 0px" }}
      variants={variants}
      className={className}
      style={style}
      id={id}
    >
      {children}
    </MotionTag>
  );
}
