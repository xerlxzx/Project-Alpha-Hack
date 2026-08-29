"use client";

import * as React from "react";
import { motion, useReducedMotion } from "framer-motion";

import { AuthPanel } from "@/components/AuthPanel";
import { DemoLogin } from "@/components/DemoLogin";
import { Reveal } from "@/components/motion/Reveal";
import { stagger, riseItem, ease } from "@/components/motion/tokens";

const TAGLINE = "Stop scrolling. Start doing something, with someone.";

export default function LandingPage() {
  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-x-clip px-6 py-16">
      <Atmosphere />

      <motion.div
        variants={stagger(0.15, 0.12)}
        initial="hidden"
        animate="show"
        className="flex w-full max-w-sm flex-col items-center text-center"
      >
        <motion.h1
          variants={riseItem}
          className="font-display text-5xl font-semibold tracking-tight text-foreground sm:text-6xl"
        >
          Project Alpha
        </motion.h1>

        <motion.p
          variants={riseItem}
          className="mt-4 max-w-xs text-balance text-lg leading-relaxed text-muted-foreground"
        >
          {TAGLINE}
        </motion.p>

        <motion.div variants={riseItem} className="mt-8 w-full">
          <AuthPanel className="mx-auto" />
        </motion.div>

        <motion.div
          variants={riseItem}
          className="mt-6 flex w-full max-w-sm items-center gap-3 text-xs font-medium uppercase tracking-wide text-muted-foreground"
        >
          <span className="h-px flex-1 bg-border" />
          or
          <span className="h-px flex-1 bg-border" />
        </motion.div>

        <motion.div variants={riseItem} className="mt-6 flex flex-col items-center gap-2">
          <DemoLogin />
          <p className="max-w-xs text-xs text-muted-foreground">
            Skip sign-up — explore the full app as a seeded demo student.
          </p>
        </motion.div>
      </motion.div>

      <Reveal delay={0.1} className="mt-16 text-center text-xs text-muted-foreground/70">
        Prototype for SYNCS Hack 2026 · Seeded data, real venues.
      </Reveal>
    </div>
  );
}

/* Quiet ambient background with reduced-motion support. */
function Atmosphere() {
  const reduce = useReducedMotion();
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10">
      <div className="absolute inset-0 bg-surface" />
      <motion.div
        className="absolute -left-[10%] -top-[15%] h-[55vh] w-[55vh] rounded-full blur-[120px]"
        style={{
          background: "radial-gradient(circle, var(--accent) 0%, transparent 70%)",
          opacity: 0.16,
        }}
        animate={reduce ? undefined : { x: [0, 30, 0], y: [0, 20, 0] }}
        transition={{ duration: 20, repeat: Infinity, ease: ease.inOut }}
      />
      <motion.div
        className="absolute bottom-[-15%] right-[-10%] h-[50vh] w-[50vh] rounded-full blur-[120px]"
        style={{
          background: "radial-gradient(circle, var(--cat-blue) 0%, transparent 70%)",
          opacity: 0.12,
        }}
        animate={reduce ? undefined : { x: [0, -25, 0], y: [0, -15, 0] }}
        transition={{ duration: 24, repeat: Infinity, ease: ease.inOut }}
      />
    </div>
  );
}
