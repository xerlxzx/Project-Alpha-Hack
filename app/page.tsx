"use client";

import * as React from "react";
import { motion, useReducedMotion } from "framer-motion";

import HalftoneFlow from "@/components/ui/halftone-flow";
import { AuthPanel } from "@/components/AuthPanel";
import { DemoLogin } from "@/components/DemoLogin";
import { spring } from "@/components/motion/tokens";

// Hero entrance: a slower, more luxurious settle than the app-wide default so
// the title feels cinematic, rising and de-blurring in sequence.
const heroStagger = {
  hidden: {},
  show: { transition: { delayChildren: 0.25, staggerChildren: 0.16 } },
};
const heroItem = {
  hidden: { opacity: 0, y: 24, filter: "blur(10px)" },
  show: { opacity: 1, y: 0, filter: "blur(0px)", transition: spring.soft },
};

export default function LandingPage() {
  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-x-clip px-6 py-16">
      <HeroBackdrop />

      <motion.div
        variants={heroStagger}
        initial="hidden"
        animate="show"
        className="flex w-full max-w-sm flex-col items-center text-center"
      >
        <motion.h1
          variants={heroItem}
          className="font-display text-5xl font-light tracking-[-0.02em] text-white drop-shadow-[0_2px_16px_rgba(0,0,0,0.7)] sm:text-6xl"
        >
          Project Alpha
        </motion.h1>

        <motion.div variants={heroItem} className="mt-8 w-full">
          <AuthPanel className="mx-auto" />
        </motion.div>

        <motion.div
          variants={heroItem}
          className="mt-6 flex w-full max-w-sm items-center gap-3 text-xs font-medium uppercase tracking-wide text-white/60"
        >
          <span className="h-px flex-1 bg-white/20" />
          or
          <span className="h-px flex-1 bg-white/20" />
        </motion.div>

        <motion.div variants={heroItem} className="mt-6 flex flex-col items-center">
          <DemoLogin />
        </motion.div>
      </motion.div>
    </div>
  );
}

/*
 * Hero backdrop: the HalftoneFlow WebGL halftone animation runs full-bleed
 * behind the content, drifting slowly (transform only) so the scene feels
 * alive without strobing. Over it: a depth vignette, a subtle cinematic
 * letterbox darkening top and bottom, and a fine film grain. These layers
 * make the frosted auth card read as floating above a lit scene. The flow is
 * always dark red/black regardless of theme.
 */
function HeroBackdrop() {
  const reduce = useReducedMotion();

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-black">
      <motion.div
        className="absolute inset-0"
        animate={
          reduce
            ? undefined
            : { scale: [1, 1.06, 1], x: ["0%", "-1.5%", "0%"], y: ["0%", "1.2%", "0%"] }
        }
        transition={{ duration: 44, repeat: Infinity, ease: "easeInOut" }}
      >
        <HalftoneFlow className="absolute inset-0 h-full w-full" />
      </motion.div>

      {/* Depth vignette: pulls focus to the center where the card sits. */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(0,0,0,0.55)_62%,rgba(0,0,0,0.85)_100%)]" />
      {/* Cinematic letterbox darkening at the top and bottom edges. */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-transparent to-black/60" />
      {/* Film grain. */}
      <div className="noise-grain absolute inset-0 opacity-[0.06] mix-blend-overlay" />
    </div>
  );
}
