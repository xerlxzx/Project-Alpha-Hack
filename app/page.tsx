"use client";

import * as React from "react";
import { motion } from "framer-motion";

import { AuthPanel } from "@/components/AuthPanel";
import { DemoLogin } from "@/components/DemoLogin";
import { MatchingField } from "@/components/landing/MatchingField";
import { Reveal } from "@/components/motion/Reveal";
import { stagger, riseItem } from "@/components/motion/tokens";

const TAGLINE = "Stop scrolling. Start doing something, with someone.";

export default function LandingPage() {
  const hostRef = React.useRef<HTMLDivElement>(null);

  return (
    <div
      ref={hostRef}
      className="dark relative isolate flex min-h-dvh flex-col items-center justify-center overflow-x-clip bg-[#0b0a09] px-6 py-16 text-foreground"
    >
      <MatchingField hostRef={hostRef} />

      <motion.div
        variants={stagger(0.15, 0.12)}
        initial="hidden"
        animate="show"
        data-landing-void
        className="relative z-10 flex w-full max-w-sm flex-col items-center text-center"
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
          <AuthPanel className="mx-auto bg-card/80 shadow-[0_0_0_1px_rgba(232,220,200,0.12)]" />
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
