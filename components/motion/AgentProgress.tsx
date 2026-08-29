"use client";

import * as React from "react";
import Image from "next/image";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check, Sparkles, MapPin, ListFilter, Star } from "lucide-react";

import { GlassPanel } from "@/components/GlassPanel";
import { cn } from "@/lib/utils";
import { spring, ease } from "./tokens";

type StepState = "pending" | "active" | "done";

interface StepDef {
  icon: React.ComponentType<{ className?: string }>;
  label: (n: number) => string;
  /** ms this step stays "active" before advancing. */
  duration: number;
}

const STEPS: StepDef[] = [
  { icon: Sparkles, label: () => "Analyzing group interests", duration: 1600 },
  { icon: MapPin, label: () => "Searching Google Places nearby", duration: 2000 },
  { icon: MapPin, label: (n) => `Found ${n} real candidates`, duration: 1500 },
  { icon: ListFilter, label: () => "Ranking by fit & budget", duration: 1700 },
  { icon: Star, label: () => "Selected: Toby's Estate, Chippendale", duration: 2400 },
];

// Where the candidate pins land over the beacon illustration (% of the frame).
const PINS = [
  { left: 30, top: 40, color: "var(--cat-blue)" },
  { left: 63, top: 33, color: "var(--cat-sage)" },
  { left: 24, top: 63, color: "var(--cat-clay)" },
  { left: 72, top: 62, color: "var(--cat-plum)" },
  { left: 50, top: 50, color: "var(--accent)", winner: true },
];

export interface AgentProgressProps {
  /** Loop the sequence forever (for demos/showcases). */
  loop?: boolean;
  /** Fired once when the sequence reaches "Selected" (ignored while looping). */
  onComplete?: () => void;
  className?: string;
}

/**
 * Venue-agent progress overlay: abstract map with candidate pins dropping in
 * live, beside a glass step-list narrating each real API call.
 */
export function AgentProgress({ loop = true, onComplete, className }: AgentProgressProps) {
  const reduce = useReducedMotion();
  const [rawActive, setActive] = React.useState(0);
  const [rawFound, setFound] = React.useState(0);

  // Under reduced motion we skip the timeline entirely and render the resolved
  // end state, so no state is ever set synchronously inside an effect.
  const active = reduce ? STEPS.length - 1 : rawActive;
  const found = reduce ? 23 : rawFound;

  // Advance through the steps on their individual durations (async callback).
  React.useEffect(() => {
    if (reduce) return;
    const t = setTimeout(() => {
      if (rawActive < STEPS.length - 1) {
        setActive(rawActive + 1);
      } else if (loop) {
        setActive(0);
        setFound(0);
      } else {
        onComplete?.();
      }
    }, STEPS[rawActive].duration);
    return () => clearTimeout(t);
  }, [rawActive, loop, onComplete, reduce]);

  // Count the candidate tally up while the "Found N" step is live.
  React.useEffect(() => {
    if (reduce || rawActive < 2) return;
    const t = setInterval(
      () => setFound((n) => (n >= 23 ? n : n + 1)),
      55,
    );
    return () => clearInterval(t);
  }, [rawActive, reduce]);

  const pinsVisible = active >= 2;

  return (
    <div className={cn("grid gap-4 sm:grid-cols-[1.1fr_1fr]", className)}>
      {/* Map / beacon with dropping pins */}
      <div className="relative aspect-square overflow-hidden rounded-3xl border border-border bg-surface dark:brightness-[0.92]">
        <Image
          src="/illustrations/beacon.png"
          alt=""
          fill
          sizes="(max-width: 640px) 100vw, 40vw"
          className="object-cover"
        />
        {/* Amber wash to bind the illustration to the UI */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[var(--accent)]/10 to-transparent" />

        {PINS.map((pin, i) => (
          <AnimatePresence key={i}>
            {pinsVisible && (
              <motion.div
                className="absolute"
                style={{ left: `${pin.left}%`, top: `${pin.top}%` }}
                initial={{ opacity: 0, y: -34, scale: 0.4 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={
                  reduce
                    ? { duration: 0 }
                    : { ...spring.bouncy, delay: 0.12 * i }
                }
              >
                <div className="relative -translate-x-1/2 -translate-y-full">
                  {/* Radiating pulse for the winning pin once selected */}
                  {pin.winner && active >= 4 && !reduce && (
                    <>
                      {[0, 1].map((r) => (
                        <motion.span
                          key={r}
                          className="absolute left-1/2 top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[var(--accent)]"
                          initial={{ scale: 0.6, opacity: 0.7 }}
                          animate={{ scale: 3.4, opacity: 0 }}
                          transition={{
                            duration: 1.6,
                            repeat: Infinity,
                            delay: r * 0.5,
                            ease: ease.out,
                          }}
                        />
                      ))}
                    </>
                  )}
                  <MapPin
                    className={cn(
                      "h-6 w-6 drop-shadow-sm transition-transform",
                      pin.winner && active >= 4 ? "scale-125" : "",
                    )}
                    style={{
                      color: pin.color,
                      fill:
                        pin.winner && active >= 4 ? "var(--accent)" : "transparent",
                    }}
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        ))}
      </div>

      {/* Glass step list */}
      <GlassPanel withTextBacking transitioning className="flex flex-col justify-center gap-1 p-4">
        {STEPS.map((step, i) => {
          const state: StepState =
            i < active ? "done" : i === active ? "active" : "pending";
          const Icon = step.icon;
          return (
            <div
              key={i}
              className="relative flex items-center gap-3 overflow-hidden rounded-xl px-2.5 py-2.5"
            >
              {/* Shimmer sweep on the active row (transform only) */}
              {state === "active" && !reduce && (
                <motion.div
                  aria-hidden
                  className="pointer-events-none absolute inset-0"
                  style={{
                    background:
                      "linear-gradient(100deg, transparent 20%, var(--accent) 50%, transparent 80%)",
                    opacity: 0.12,
                  }}
                  initial={{ x: "-120%" }}
                  animate={{ x: "120%" }}
                  transition={{ duration: 1.4, repeat: Infinity, ease: ease.inOut }}
                />
              )}

              {/* Status glyph */}
              <div className="relative grid h-7 w-7 shrink-0 place-items-center">
                <AnimatePresence mode="wait" initial={false}>
                  {state === "done" ? (
                    <motion.span
                      key="done"
                      className="grid h-7 w-7 place-items-center rounded-full bg-[var(--accent)] text-[var(--accent-foreground)]"
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={reduce ? { duration: 0.15 } : spring.bouncy}
                    >
                      <Check className="h-4 w-4" />
                    </motion.span>
                  ) : state === "active" ? (
                    <motion.span
                      key="active"
                      className="relative grid h-7 w-7 place-items-center rounded-full border border-[var(--accent)]/40 text-[var(--accent)]"
                    >
                      <Icon className="h-4 w-4" />
                      {!reduce && (
                        <motion.span
                          aria-hidden
                          className="absolute inset-0 rounded-full bg-[var(--accent)]/25"
                          animate={{ scale: [1, 1.6, 1], opacity: [0.5, 0, 0.5] }}
                          transition={{
                            duration: 1.6,
                            repeat: Infinity,
                            ease: ease.inOut,
                          }}
                        />
                      )}
                    </motion.span>
                  ) : (
                    <motion.span
                      key="pending"
                      className="grid h-7 w-7 place-items-center rounded-full border border-border text-muted-foreground/50"
                      initial={{ opacity: 0.6 }}
                      animate={{ opacity: 0.6 }}
                    >
                      <Icon className="h-4 w-4" />
                    </motion.span>
                  )}
                </AnimatePresence>
              </div>

              {/* Label */}
              <motion.span
                className={cn(
                  "relative text-sm",
                  state === "pending" && "text-muted-foreground/60",
                  state === "active" && "font-medium text-foreground",
                  state === "done" && "text-muted-foreground",
                )}
                animate={{ opacity: state === "pending" ? 0.55 : 1 }}
                transition={{ duration: 0.3 }}
              >
                {step.label(found)}
              </motion.span>
            </div>
          );
        })}
      </GlassPanel>
    </div>
  );
}
