"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";

import { AuthPanel } from "@/components/AuthPanel";
import { DemoLogin } from "@/components/DemoLogin";
import { Reveal } from "@/components/motion/Reveal";
import { stagger, riseItem } from "@/components/motion/tokens";
import { Button } from "@/components/ui/button";
import { HalftoneFlow } from "@/components/ui/halftone-flow";

const TAGLINE = "Stop scrolling. Start doing something, with someone.";

export default function LandingPage() {
  const [showSignIn, setShowSignIn] = React.useState(false);

  return (
    <div className="dark relative isolate flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-black px-6 py-16 text-foreground">
      {/* Animated WebGL halftone hero (21st.dev). Sandboxed iframe, so it must
          never capture pointer events — clicks pass through to the CTAs. */}
      <HalftoneFlow className="pointer-events-none absolute inset-0 -z-20 h-full w-full" />
      {/* Legibility scrim: darken the busy flow behind the copy and CTAs. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(120%_90%_at_50%_40%,rgba(0,0,0,0.25),rgba(0,0,0,0.72))]"
      />

      <motion.div
        variants={stagger(0.15, 0.12)}
        initial="hidden"
        animate="show"
        data-landing-void
        className="relative z-10 flex w-full max-w-md flex-col items-center text-center"
      >
        <motion.h1
          variants={riseItem}
          className="font-display text-6xl font-semibold tracking-tight text-white drop-shadow-[0_2px_24px_rgba(0,0,0,0.6)] sm:text-7xl"
        >
          Project Alpha
        </motion.h1>

        <motion.p
          variants={riseItem}
          className="mt-4 max-w-xs text-balance text-lg leading-relaxed text-white/70"
        >
          {TAGLINE}
        </motion.p>

        {/* CTA pair: fast demo path + real sign-in. */}
        <motion.div
          variants={riseItem}
          className="mt-10 flex flex-wrap items-center justify-center gap-3"
        >
          <DemoLogin />
          <Button
            type="button"
            size="lg"
            onClick={() => setShowSignIn((v) => !v)}
            aria-expanded={showSignIn}
            className="rounded-full bg-[var(--accent)] text-[var(--accent-foreground)] shadow-[0_18px_40px_-24px_rgba(0,0,0,0.85)] hover:bg-[var(--accent)]/90"
          >
            Sign in
          </Button>
        </motion.div>

        {/* Sign-in card reveals on demand so the hero stays clean by default. */}
        <AnimatePresence initial={false}>
          {showSignIn && (
            <motion.div
              key="auth"
              initial={{ opacity: 0, y: -8, height: 0 }}
              animate={{ opacity: 1, y: 0, height: "auto" }}
              exit={{ opacity: 0, y: -8, height: 0 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              className="mt-8 w-full overflow-hidden"
            >
              <AuthPanel className="mx-auto" />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      <Reveal delay={0.1} className="relative z-10 mt-16 text-center text-xs text-white/50">
        Prototype for SYNCS Hack 2026 · Seeded data, real venues.
      </Reveal>
    </div>
  );
}
