"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  CalendarClock,
  Clock,
  Loader2,
  MapPin,
  SlidersHorizontal,
  Wallet,
  Zap,
} from "lucide-react";

import { GlassPanel } from "@/components/GlassPanel";
import { PrimaryCTA } from "@/components/motion/PrimaryCTA";
import { spring, stagger, riseItem } from "@/components/motion/tokens";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

type Mode = "im_free" | "plan_ahead";
type StartChoice = "now" | "1h" | "evening";
type SocialEnergy = "low" | "medium" | "high";
type MatchState = "idle" | "loading" | "insufficient" | "error";

// Mirrors the unexported POST /api/match response shapes:
// app/api/match/route.ts's ReadyResponse / InsufficientResponse.
interface MatchSuggestion {
  meetupId: string;
  activityIntent: string | null;
  tags: string[] | null;
  scheduledAt: string | null;
}

interface InsufficientMatch {
  status: "insufficient";
  nearestFuture: { startAt: string } | null;
  suggestion: MatchSuggestion | null;
}

interface ReadyMatch {
  status: "ready";
  meetupId: string;
}

interface Controls {
  startChoice: StartChoice;
  planDate: string;
  planTime: string;
  maxDurationMin: number;
  travelKm: number;
  budgetAud: number;
  socialEnergy: SocialEnergy;
}

function defaultControls(): Controls {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return {
    startChoice: "now",
    planDate: tomorrow.toISOString().slice(0, 10),
    planTime: "18:00",
    maxDurationMin: 120,
    travelKm: 10,
    budgetAud: 25,
    socialEnergy: "medium",
  };
}

function computeImFreeStartAt(choice: StartChoice): string {
  const start = new Date();
  if (choice === "1h") {
    start.setHours(start.getHours() + 1);
  } else if (choice === "evening") {
    start.setHours(18, 0, 0, 0);
    if (start.getTime() < Date.now()) start.setDate(start.getDate() + 1);
  }
  return start.toISOString();
}

const DURATION_OPTIONS = [
  { label: "1h", value: 60 },
  { label: "2h", value: 120 },
  { label: "3h", value: 180 },
  { label: "4h+", value: 240 },
];

const SOCIAL_ENERGY_OPTIONS: { label: string; value: SocialEnergy }[] = [
  { label: "Low", value: "low" },
  { label: "Medium", value: "medium" },
  { label: "High", value: "high" },
];

export default function HomePage() {
  const router = useRouter();
  const reduce = useReducedMotion();

  const [controls, setControls] = React.useState<Controls>(defaultControls);
  const [sheetMode, setSheetMode] = React.useState<Mode>("im_free");
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [matchState, setMatchState] = React.useState<MatchState>("idle");
  const [insufficientMatch, setInsufficientMatch] =
    React.useState<InsufficientMatch | null>(null);
  const [matchError, setMatchError] = React.useState<string | null>(null);
  const [lastAttempt, setLastAttempt] = React.useState<Mode>("im_free");

  function patch(partial: Partial<Controls>) {
    setControls((c) => ({ ...c, ...partial }));
  }

  async function startMatch(mode: Mode, c: Controls) {
    setSheetOpen(false);
    setLastAttempt(mode);
    setMatchState("loading");

    const startAt =
      mode === "plan_ahead"
        ? new Date(`${c.planDate}T${c.planTime}`).toISOString()
        : computeImFreeStartAt(c.startChoice);
    const endAt = new Date(
      new Date(startAt).getTime() + c.maxDurationMin * 60_000,
    ).toISOString();

    try {
      const res = await fetch("/api/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // /api/match derives the caller from the session
        // (falling back to the seeded demo user), never from the body.
        body: JSON.stringify({
          travelKm: c.travelKm,
          budgetAud: c.budgetAud,
          socialEnergy: c.socialEnergy,
          availability: [{ startAt, endAt, mode }],
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        setMatchError(
          typeof data?.error === "string"
            ? data.error
            : `Match request failed (${res.status})`,
        );
        setMatchState("error");
        return;
      }

      if ((data as { status?: string } | null)?.status === "insufficient") {
        setInsufficientMatch(data as InsufficientMatch);
        setMatchState("insufficient");
        return;
      }

      const ready = data as ReadyMatch;
      if (!ready?.meetupId) throw new Error("Match response missing meetupId");

      router.push(`/match?meetupId=${ready.meetupId}`);
    } catch {
      setMatchError("Couldn't reach the matching service.");
      setMatchState("error");
    }
  }

  return (
    <div className="relative min-h-dvh overflow-x-clip bg-surface">
      <Atmosphere />

      <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-6 py-16">
        <motion.div
          variants={stagger(0.15, 0.1)}
          initial={reduce ? undefined : "hidden"}
          animate={reduce ? undefined : "show"}
          className="text-center"
        >
          <motion.span
            variants={riseItem}
            className="inline-flex items-center gap-2 rounded-full border border-border bg-card/50 px-3 py-1 text-xs font-medium text-muted-foreground backdrop-blur"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
            Later today
          </motion.span>

          <motion.h1
            variants={riseItem}
            className="mt-5 font-display text-4xl font-semibold tracking-tight text-foreground sm:text-5xl"
          >
            What are you up for?
          </motion.h1>
          <motion.p
            variants={riseItem}
            className="mx-auto mt-3 max-w-sm text-muted-foreground"
          >
            One tap and Project Alpha starts matching you with people free right
            now — or plan something for later.
          </motion.p>

          <motion.div
            variants={riseItem}
            className="mt-10 flex flex-col items-center gap-3"
          >
            <div className="flex items-center gap-3">
              <PrimaryCTA
                onClick={() => startMatch("im_free", controls)}
                glow={!reduce}
              >
                <Zap className="h-4 w-4" />
                I&apos;m free
              </PrimaryCTA>
              <button
                type="button"
                onClick={() => {
                  setSheetMode("im_free");
                  setSheetOpen(true);
                }}
                aria-label="Customize availability, travel, budget and social energy"
                className="grid h-[52px] w-[52px] shrink-0 place-items-center rounded-full border border-border text-foreground/70 transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
              >
                <SlidersHorizontal className="h-4.5 w-4.5" />
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              Defaults are ready — customize if you want.
            </p>

            <button
              type="button"
              onClick={() => {
                setSheetMode("plan_ahead");
                setSheetOpen(true);
              }}
              className="mt-4 inline-flex items-center gap-2 rounded-full border border-border px-5 py-2.5 text-sm font-medium text-foreground/80 transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
            >
              <CalendarClock className="h-4 w-4" />
              Plan ahead
            </button>
          </motion.div>
        </motion.div>
      </main>

      <ControlsSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        mode={sheetMode}
        onModeChange={setSheetMode}
        controls={controls}
        onPatch={patch}
        onConfirm={(mode) => startMatch(mode, controls)}
      />

      <MatchOverlay
        state={matchState}
        insufficient={insufficientMatch}
        error={matchError}
        onDismiss={() => setMatchState("idle")}
        onRetry={() => startMatch(lastAttempt, controls)}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Controls bottom sheet. Sanctioned GlassPanel surface.                */
/* ------------------------------------------------------------------ */

function ControlsSheet({
  open,
  onOpenChange,
  mode,
  onModeChange,
  controls,
  onPatch,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: Mode;
  onModeChange: (mode: Mode) => void;
  controls: Controls;
  onPatch: (partial: Partial<Controls>) => void;
  onConfirm: (mode: Mode) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="max-h-[88vh] gap-0 border-0 bg-transparent p-0 shadow-none"
      >
        <GlassPanel
          withTextBacking
          transitioning
          className="max-h-[88vh] overflow-y-auto rounded-b-none rounded-t-3xl px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-3"
        >
          <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-foreground/15" />

          <SheetHeader className="mb-5 gap-0 p-0 text-left">
            <SheetTitle className="font-display text-xl">
              Your plan
            </SheetTitle>
            <SheetDescription>
              Tune availability, distance, budget and energy — or leave the
              defaults.
            </SheetDescription>
          </SheetHeader>

          {/* Mode segmented control */}
          <div className="grid grid-cols-2 gap-1 rounded-full bg-muted p-1">
            <button
              type="button"
              onClick={() => onModeChange("im_free")}
              className={cn(
                "rounded-full py-2 text-sm font-medium transition-colors",
                mode === "im_free"
                  ? "bg-[var(--accent)] text-[var(--accent-foreground)]"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              I&apos;m free
            </button>
            <button
              type="button"
              onClick={() => onModeChange("plan_ahead")}
              className={cn(
                "rounded-full py-2 text-sm font-medium transition-colors",
                mode === "plan_ahead"
                  ? "bg-[var(--accent)] text-[var(--accent-foreground)]"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Plan ahead
            </button>
          </div>

          {/* Availability window */}
          <Field icon={<Clock className="h-4 w-4" />} label="Starting">
            {mode === "im_free" ? (
              <ChipRow>
                {(
                  [
                    { label: "Now", value: "now" },
                    { label: "In 1 hour", value: "1h" },
                    { label: "This evening", value: "evening" },
                  ] as { label: string; value: StartChoice }[]
                ).map((opt) => (
                  <Chip
                    key={opt.value}
                    active={controls.startChoice === opt.value}
                    onClick={() => onPatch({ startChoice: opt.value })}
                  >
                    {opt.label}
                  </Chip>
                ))}
              </ChipRow>
            ) : (
              <div className="flex gap-2">
                <input
                  type="date"
                  value={controls.planDate}
                  onChange={(e) => onPatch({ planDate: e.target.value })}
                  className="flex-1 rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground"
                />
                <input
                  type="time"
                  value={controls.planTime}
                  onChange={(e) => onPatch({ planTime: e.target.value })}
                  className="w-28 rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground"
                />
              </div>
            )}
          </Field>

          <Field icon={<Clock className="h-4 w-4" />} label="Max duration">
            <ChipRow>
              {DURATION_OPTIONS.map((opt) => (
                <Chip
                  key={opt.value}
                  active={controls.maxDurationMin === opt.value}
                  onClick={() => onPatch({ maxDurationMin: opt.value })}
                >
                  {opt.label}
                </Chip>
              ))}
            </ChipRow>
          </Field>

          <Field
            icon={<MapPin className="h-4 w-4" />}
            label="Travel range"
            value={`Up to ${controls.travelKm} km`}
          >
            <input
              type="range"
              min={1}
              max={30}
              step={1}
              value={controls.travelKm}
              onChange={(e) => onPatch({ travelKm: Number(e.target.value) })}
              className="w-full accent-[var(--accent)]"
            />
          </Field>

          <Field
            icon={<Wallet className="h-4 w-4" />}
            label="Budget"
            value={`Up to $${controls.budgetAud}`}
          >
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={controls.budgetAud}
              onChange={(e) => onPatch({ budgetAud: Number(e.target.value) })}
              className="w-full accent-[var(--accent)]"
            />
          </Field>

          <Field icon={<Zap className="h-4 w-4" />} label="Social energy">
            <ChipRow>
              {SOCIAL_ENERGY_OPTIONS.map((opt) => (
                <Chip
                  key={opt.value}
                  active={controls.socialEnergy === opt.value}
                  onClick={() => onPatch({ socialEnergy: opt.value })}
                >
                  {opt.label}
                </Chip>
              ))}
            </ChipRow>
          </Field>

          <PrimaryCTA
            onClick={() => onConfirm(mode)}
            glow={false}
            className="mt-6 mb-2 w-full justify-center"
          >
            {mode === "im_free" ? "I'm free — find my people" : "Lock in my plan"}
          </PrimaryCTA>
        </GlassPanel>
      </SheetContent>
    </Sheet>
  );
}

function Field({
  icon,
  label,
  value,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  value?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-5 first:mt-5">
      <div className="mb-2 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
          <span className="text-[var(--accent)]">{icon}</span>
          {label}
        </span>
        {value && (
          <span className="text-xs text-muted-foreground">{value}</span>
        )}
      </div>
      {children}
    </div>
  );
}

function ChipRow({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap gap-2">{children}</div>;
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
        active
          ? "border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--accent)]"
          : "border-border text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Match overlay for loading, insufficient fallback, and errors. */
/* ------------------------------------------------------------------ */

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

function MatchOverlay({
  state,
  insufficient,
  error,
  onDismiss,
  onRetry,
}: {
  state: MatchState;
  insufficient: InsufficientMatch | null;
  error: string | null;
  onDismiss: () => void;
  onRetry: () => void;
}) {
  return (
    <AnimatePresence>
      {state !== "idle" && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={spring.snappy}
          className="fixed inset-0 z-50 grid place-items-center bg-black/30 px-6 backdrop-blur-[2px]"
        >
          <GlassPanel
            withTextBacking
            className="w-full max-w-sm rounded-3xl p-6 text-center"
          >
            {state === "loading" && (
              <>
                <Loader2 className="mx-auto h-8 w-8 animate-spin text-[var(--accent)]" />
                <p className="mt-4 font-display text-lg font-semibold text-foreground">
                  Finding your people…
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Matching against who&apos;s free nearby right now.
                </p>
              </>
            )}

            {state === "insufficient" && (
              <>
                <p className="font-display text-lg font-semibold text-foreground">
                  No group ready yet
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  We couldn&apos;t find enough compatible people right now —
                  you&apos;re in the pool for the next match.
                </p>

                {insufficient?.nearestFuture && (
                  <p className="mt-4 text-sm text-foreground">
                    Next likely window:{" "}
                    <span className="font-medium">
                      {formatWhen(insufficient.nearestFuture.startAt)}
                    </span>
                  </p>
                )}

                {insufficient?.suggestion && (
                  <a
                    href={`/meetup/${insufficient.suggestion.meetupId}`}
                    className="mt-4 block rounded-2xl border border-border bg-card/60 p-3 text-left text-sm transition-colors hover:border-[var(--accent)]"
                  >
                    <div className="font-medium text-foreground">
                      {insufficient.suggestion.activityIntent ??
                        "A seeded activity nearby"}
                    </div>
                    {insufficient.suggestion.tags &&
                      insufficient.suggestion.tags.length > 0 && (
                        <div className="mt-1 text-xs text-muted-foreground">
                          {insufficient.suggestion.tags.join(" · ")}
                        </div>
                      )}
                  </a>
                )}

                <button
                  type="button"
                  onClick={onDismiss}
                  className="mt-5 rounded-full bg-[var(--accent)] px-5 py-2 text-sm font-semibold text-[var(--accent-foreground)]"
                >
                  Got it
                </button>
              </>
            )}

            {state === "error" && (
              <>
                <p className="font-display text-lg font-semibold text-foreground">
                  Something went wrong
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  {error ?? "Couldn't complete the match request."}
                </p>
                <div className="mt-5 flex justify-center gap-2">
                  <button
                    type="button"
                    onClick={onDismiss}
                    className="rounded-full border border-border px-5 py-2 text-sm font-medium text-foreground/80"
                  >
                    Dismiss
                  </button>
                  <button
                    type="button"
                    onClick={onRetry}
                    className="rounded-full bg-[var(--accent)] px-5 py-2 text-sm font-semibold text-[var(--accent-foreground)]"
                  >
                    Try again
                  </button>
                </div>
              </>
            )}
          </GlassPanel>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ------------------------------------------------------------------ */
/* Ambient background matching the landing page's warm mesh treatment. */
/* ------------------------------------------------------------------ */

function Atmosphere() {
  const reduce = useReducedMotion();
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10">
      <div className="absolute inset-0 bg-surface" />
      <motion.div
        className="absolute -left-[10%] -top-[10%] h-[60vh] w-[60vh] rounded-full blur-[120px]"
        style={{
          background:
            "radial-gradient(circle, var(--accent) 0%, transparent 70%)",
          opacity: 0.16,
        }}
        animate={reduce ? undefined : { x: [0, 40, 0], y: [0, 30, 0] }}
        transition={{ duration: 18, repeat: Infinity }}
      />
      <motion.div
        className="absolute right-[-10%] top-[30%] h-[55vh] w-[55vh] rounded-full blur-[120px]"
        style={{
          background:
            "radial-gradient(circle, var(--cat-blue) 0%, transparent 70%)",
          opacity: 0.12,
        }}
        animate={reduce ? undefined : { x: [0, -30, 0], y: [0, 40, 0] }}
        transition={{ duration: 22, repeat: Infinity }}
      />
    </div>
  );
}
