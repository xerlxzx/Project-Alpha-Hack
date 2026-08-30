"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ArrowUp,
  CalendarClock,
  Clock,
  Coffee,
  Compass,
  Feather,
  GraduationCap,
  Loader2,
  MapPin,
  MessageCircle,
  SlidersHorizontal,
  Sparkles,
  User,
  UtensilsCrossed,
  Wallet,
  X,
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

function rangeOptions(
  min: number,
  max: number,
  step: number,
  format: (v: number) => string,
): { value: number; label: string }[] {
  const out: { value: number; label: string }[] = [];
  for (let v = min; v <= max + 1e-9; v += step) {
    const n = Math.round(v * 1000) / 1000;
    out.push({ value: n, label: format(n) });
  }
  return out;
}

const START_OPTIONS: { value: StartChoice; label: string }[] = [
  { value: "now", label: "Now" },
  { value: "1h", label: "In 1 hour" },
  { value: "evening", label: "This evening" },
];
const TRAVEL_OPTIONS = rangeOptions(1, 30, 1, (v) => `${v} km`);
const BUDGET_OPTIONS = rangeOptions(0, 100, 5, (v) => `$${v}`);

const SUBTITLES = [
  "One tap and we start matching you with people free right now, or plan something for later.",
  "Hungry, bored, or up for a run? Find someone nearby who's free too.",
  "Grab food, study together, hit the court, or see who's around.",
  "Say you're free and we'll find people close by who are too.",
  "Coffee, a workout, a study session, or something spontaneous. Pick your energy.",
  "The best plans happen last minute. Find someone nearby in one tap.",
  "People near you are free right now. Want to meet up?",
  "Food, study, sport, or something you haven't thought of yet. Start here.",
];

/* ------------------------------------------------------------------ */
/* Activity intents. A tapped chip personalises the hero (copy + glow)  */
/* and rides along as `proposedActivity` in the match request, where    */
/* lib/matcher gates it against the excluded-activity list. Selected     */
/* styling follows the category-chip convention in GroupPreview.tsx.     */
/* ------------------------------------------------------------------ */

// Chip ids are the visible activities; surprise ids are hidden activities that
// only "Surprise me" can land on; no chip ever renders for them.
type ChipActivityId = "food" | "study" | "coffee" | "badminton" | "explore";
type SurpriseActivityId =
  | "bouldering"
  | "live_music"
  | "board_games"
  | "gallery"
  | "night_market";
type ActivityId = ChipActivityId | SurpriseActivityId;

// Shared shape that personalises the hero (tagline + glow) and supplies
// proposedActivity to the matcher, used by both the visible chips and the
// hidden surprise-only activities.
interface ActivityMeta {
  id: ActivityId;
  label: string;
  /** Sent as proposedActivity; null means "open to anything". */
  proposed: string | null;
  /** Personalised subtitle shown while this activity is active. */
  tagline: string;
  /** Ambient glow colour that crossfades in behind the hero. */
  glow: string;
}

// A visible chip additionally carries its icon and selected-state styling.
interface Activity extends ActivityMeta {
  Icon: React.ComponentType<{ className?: string }>;
  /** Static (JIT-scannable) classes for the selected state. */
  selectedClass: string;
}

const ACTIVITIES: Activity[] = [
  {
    id: "food",
    label: "Food",
    Icon: UtensilsCrossed,
    proposed: "food",
    tagline: "Find someone nearby to grab a bite with.",
    glow: "var(--cat-clay)",
    selectedClass: "border-cat-clay/45 bg-cat-clay/25 text-cat-foreground",
  },
  {
    id: "study",
    label: "Study",
    Icon: GraduationCap,
    proposed: "study",
    tagline: "Pair up for a focused study session close by.",
    glow: "var(--cat-blue)",
    selectedClass: "border-cat-blue/45 bg-cat-blue/25 text-cat-foreground",
  },
  {
    id: "coffee",
    label: "Coffee",
    Icon: Coffee,
    proposed: "coffee",
    tagline: "Someone near you is up for a coffee too.",
    glow: "var(--cat-teal)",
    selectedClass: "border-cat-teal/45 bg-cat-teal/25 text-cat-foreground",
  },
  {
    id: "badminton",
    label: "Badminton",
    Icon: Feather,
    proposed: "badminton",
    tagline: "Grab a court and find a hitting partner nearby.",
    glow: "var(--cat-sage)",
    selectedClass: "border-cat-sage/45 bg-cat-sage/25 text-cat-foreground",
  },
  {
    id: "explore",
    label: "Explore",
    Icon: Compass,
    proposed: null,
    tagline: "Open to anything. We'll surface something new nearby.",
    glow: "var(--cat-plum)",
    selectedClass: "border-cat-plum/45 bg-cat-plum/25 text-cat-foreground",
  },
];

// Hidden surprise-only activities. These never render as chips; "Surprise me"
// rotates them into its pool so it can land on something you can't already see.
// Each still personalises the hero and passes a matcher-safe proposedActivity
// (kept clear of the excluded-activity patterns in lib/matcher/loadPool.ts).
const SURPRISE_ACTIVITIES: ActivityMeta[] = [
  {
    id: "bouldering",
    label: "Bouldering",
    proposed: "bouldering",
    tagline: "Chalk up and find a bouldering partner at a gym nearby.",
    glow: "var(--cat-clay)",
  },
  {
    id: "live_music",
    label: "Live music",
    proposed: "live music",
    tagline: "Catch a local set with someone who's up for it too.",
    glow: "var(--cat-plum)",
  },
  {
    id: "board_games",
    label: "Board games",
    proposed: "board games",
    tagline: "Find a board-game café and a few players close by.",
    glow: "var(--cat-blue)",
  },
  {
    id: "gallery",
    label: "Gallery",
    proposed: "art gallery",
    tagline: "Wander a gallery or exhibition with someone new.",
    glow: "var(--cat-teal)",
  },
  {
    id: "night_market",
    label: "Night market",
    proposed: "night market",
    tagline: "Graze a night market with people nearby.",
    glow: "var(--cat-sage)",
  },
];

// Every activity the hero can reflect (chips + hidden surprises) for id lookup.
const ALL_ACTIVITIES: ActivityMeta[] = [...ACTIVITIES, ...SURPRISE_ACTIVITIES];

const ACTIVITY_STORAGE_KEY = "alpha:home:activity";

// Mirrors the GET /api/nearby response shapes (app/api/nearby/route.ts's
// NearbyEvent / NearbyResponse). Kept local to avoid importing server code.
interface NearbyEvent {
  id: string;
  title: string;
  venueName: string | null;
  hostFirstName: string | null;
  whenLabel: string;
  distanceLabel: string;
  memberCount: number;
  spotsLeft: number;
}

interface NearbyResponse {
  name: string | null;
  availableCount: number;
  events: NearbyEvent[];
}

// Mirrors POST /api/concierge's response shapes (app/api/concierge/route.ts's
// ConciergePreviewResponse / ConciergeInsufficientResponse). Kept local to
// avoid importing server code, matching this file's existing convention.
interface ConciergePreview {
  status: "preview";
  intentSummary: string;
  groupSize: number;
  genderMix: string;
  sharedInterestReasons: string[];
  venue: { name: string; reason: string; distanceKm: number; mapsUrl: string | null };
  explanation: string;
  opener: string;
  controls: {
    maxDurationMin: number;
    socialEnergy: SocialEnergy | null;
    proposedActivity: string | null;
    travelKm: number | null;
    budgetAud: number | null;
  };
}

interface ConciergeInsufficient {
  status: "insufficient";
}

type ConciergeResult =
  | ConciergePreview
  | ConciergeInsufficient
  | { status: "error"; message: string };

function greetingFor(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export default function HomePage() {
  const router = useRouter();
  const reduce = useReducedMotion();

  // SSR renders index 0 for a stable first paint; the client swaps in a random
  // pick after mount, so every startup shows a different subtitle.
  const [subtitle, setSubtitle] = React.useState(SUBTITLES[0]);
  React.useEffect(() => {
    // Deliberate post-mount swap for hydration safety, not a cascade.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSubtitle(SUBTITLES[Math.floor(Math.random() * SUBTITLES.length)]);
  }, []);

  // Chosen activity intent. SSR renders unselected; the client restores the
  // last pick after mount so the hero greets returning users with their vibe.
  const [activityId, setActivityId] = React.useState<ActivityId | null>(null);
  React.useEffect(() => {
    try {
      const saved = localStorage.getItem(ACTIVITY_STORAGE_KEY);
      if (saved && ALL_ACTIVITIES.some((a) => a.id === saved)) {
        // Post-mount restore for hydration safety, not a cascade.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setActivityId(saved as ActivityId);
      }
    } catch {
      /* storage unavailable (private mode, blocked); no restore. */
    }
  }, []);
  React.useEffect(() => {
    try {
      if (activityId) localStorage.setItem(ACTIVITY_STORAGE_KEY, activityId);
      else localStorage.removeItem(ACTIVITY_STORAGE_KEY);
    } catch {
      /* ignore persistence failures. */
    }
  }, [activityId]);

  const activity = ALL_ACTIVITIES.find((a) => a.id === activityId) ?? null;

  function toggleActivity(id: ActivityId) {
    setActivityId((cur) => (cur === id ? null : id));
  }

  // Surprise me: pick a concrete activity (never "Explore") from the full pool
  // of visible chips *and* hidden surprise-only activities, so it can land on
  // something that isn't shown as a chip. Re-rolls to a different one on repeat
  // taps so it always feels like a fresh nudge; a hidden pick lights no chip.
  function surpriseMe() {
    const pool = ALL_ACTIVITIES.filter((a) => a.id !== "explore");
    const fresh = pool.filter((a) => a.id !== activityId);
    const from = fresh.length > 0 ? fresh : pool;
    setActivityId(from[Math.floor(Math.random() * from.length)].id);
  }

  // Live home feed: the greeting name, how many people are free right now, and
  // the forming meetups nearby. Refresh quietly while the page is open and
  // again when the tab becomes visible, so the "Live" label reflects a feed
  // that actually stays current rather than a decorative animation.
  const [nearby, setNearby] = React.useState<NearbyResponse | null>(null);
  React.useEffect(() => {
    let alive = true;

    function refreshNearby() {
      fetch("/api/nearby")
        .then((r) => (r.ok ? (r.json() as Promise<NearbyResponse>) : null))
        .then((data) => {
          if (alive && data) setNearby(data);
        })
        .catch(() => {
          /* feed is non-critical; keep the last successful snapshot. */
        });
    }

    function refreshWhenVisible() {
      if (document.visibilityState === "visible") refreshNearby();
    }

    refreshNearby();
    const refreshInterval = window.setInterval(refreshNearby, 30_000);
    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      alive = false;
      window.clearInterval(refreshInterval);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, []);

  // Personalized line: an active activity always wins (it's an explicit
  // choice); otherwise, lead with real presence when we have it, and only
  // fall back to the generic rotating subtitle when nobody's around.
  const presenceLine =
    nearby && nearby.availableCount > 0
      ? `${nearby.availableCount} ${nearby.availableCount === 1 ? "person" : "people"} near you ${nearby.availableCount === 1 ? "is" : "are"} free right now.`
      : null;
  const heroLine = activity?.tagline ?? presenceLine ?? subtitle;
  const heroLineKey = activity ? activity.id : presenceLine ? "presence" : "default";

  // Time-of-day greeting. SSR renders no greeting line for a stable first
  // paint; the client fills it in from the viewer's local clock after mount.
  const [greeting, setGreeting] = React.useState<string | null>(null);
  React.useEffect(() => {
    // Post-mount read of the local clock for hydration safety, not a cascade.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setGreeting(greetingFor(new Date().getHours()));
  }, []);

  const [controls, setControls] = React.useState<Controls>(defaultControls);
  const [sheetMode, setSheetMode] = React.useState<Mode>("im_free");
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [matchState, setMatchState] = React.useState<MatchState>("idle");
  const [insufficientMatch, setInsufficientMatch] =
    React.useState<InsufficientMatch | null>(null);
  const [matchError, setMatchError] = React.useState<string | null>(null);
  const [lastAttempt, setLastAttempt] = React.useState<Mode>("im_free");
  const [conciergeResult, setConciergeResult] =
    React.useState<ConciergeResult | null>(null);

  function patch(partial: Partial<Controls>) {
    setControls((c) => ({ ...c, ...partial }));
  }

  async function startMatch(
    mode: Mode,
    c: Controls,
    proposedActivityOverride?: string | null,
  ) {
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
          // Selected in the hero; both the main CTA and the sheet's confirm
          // route through here, so the chip is honoured either way.
          proposedActivity:
            proposedActivityOverride !== undefined
              ? proposedActivityOverride
              : (ALL_ACTIVITIES.find((a) => a.id === activityId)?.proposed ?? null),
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
    <div className="home-theme relative min-h-dvh overflow-x-clip bg-black">
      <Atmosphere />
      <SelectionGlow color={activity?.glow ?? null} />

      <main className="mx-auto flex min-h-dvh max-w-lg flex-col px-6 pt-16 pb-28">
        <motion.div
          variants={stagger(0.15, 0.1)}
          initial={reduce ? undefined : "hidden"}
          animate={reduce ? undefined : "show"}
          className="text-center"
        >
          <motion.div variants={riseItem} className="min-h-[1.25rem]">
            <AnimatePresence>
              {greeting && (
                <motion.p
                  key="greeting"
                  initial={reduce ? false : { opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                  className="text-sm font-medium text-[var(--accent)]"
                >
                  {greeting}
                  {nearby?.name ? `, ${nearby.name}` : ""}
                </motion.p>
              )}
            </AnimatePresence>
          </motion.div>

          <motion.h1
            variants={riseItem}
            className="mt-2 font-display text-4xl font-semibold tracking-tight text-foreground sm:text-5xl"
          >
            What do you feel like doing?
          </motion.h1>
          <motion.p
            variants={riseItem}
            className="mx-auto mt-3 min-h-[2.5rem] max-w-sm text-muted-foreground"
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={heroLineKey}
                initial={reduce ? false : { opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduce ? { opacity: 0 } : { opacity: 0, y: -4 }}
                transition={{ duration: 0.25 }}
                className="block"
              >
                {presenceLine && !activity ? (
                  <span aria-live="polite">{heroLine}</span>
                ) : (
                  heroLine
                )}
              </motion.span>
            </AnimatePresence>
          </motion.p>

          <motion.div variants={riseItem} className="mt-6">
            <ConciergeBox onResult={setConciergeResult} />
          </motion.div>

          <motion.div variants={riseItem} className="mt-7">
            <ActivityChips
              selected={activityId}
              onToggle={toggleActivity}
              onSurprise={surpriseMe}
            />
          </motion.div>

          <motion.div
            variants={riseItem}
            className="mt-8 flex items-center justify-center gap-3"
          >
            <PrimaryCTA
              onClick={() => startMatch("im_free", controls)}
              glow={!reduce}
            >
              <Zap className="h-4 w-4" />
              Find people now
            </PrimaryCTA>
            <button
              type="button"
              onClick={() => {
                setSheetMode("im_free");
                setSheetOpen(true);
              }}
              aria-label="Customize availability, travel, budget and social energy"
              className="grid h-14 w-14 shrink-0 place-items-center rounded-full border border-border text-foreground/70 transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
            >
              <SlidersHorizontal className="h-4.5 w-4.5" />
            </button>
            <button
              type="button"
              onClick={() => {
                setSheetMode("plan_ahead");
                setSheetOpen(true);
              }}
              aria-label="Plan ahead"
              className="grid h-14 w-14 shrink-0 place-items-center rounded-full border border-border text-foreground/70 transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
            >
              <CalendarClock className="h-4.5 w-4.5" />
            </button>
          </motion.div>

          {nearby && nearby.availableCount > 0 && (
            <motion.div
              variants={riseItem}
              className="mt-5 flex items-center justify-center gap-2.5 text-sm text-muted-foreground"
            >
              <AvatarStack count={nearby.availableCount} />
              <span>
                <span className="font-semibold text-foreground">
                  {nearby.availableCount}
                </span>{" "}
                {nearby.availableCount === 1 ? "person" : "people"} nearby{" "}
                {nearby.availableCount === 1 ? "is" : "are"} free right now
              </span>
            </motion.div>
          )}
        </motion.div>

        <NearbyFeed
          events={nearby?.events ?? []}
          loaded={nearby !== null}
          reduce={!!reduce}
        />
      </main>

      <ConciergePreviewCard
        result={conciergeResult}
        onDismiss={() => setConciergeResult(null)}
        onLockIn={(preview) => {
          setConciergeResult(null);
          startMatch(
            "im_free",
            {
              ...controls,
              startChoice: "now",
              maxDurationMin: preview.controls.maxDurationMin,
              socialEnergy: preview.controls.socialEnergy ?? controls.socialEnergy,
              travelKm: preview.controls.travelKm ?? controls.travelKm,
              budgetAud: preview.controls.budgetAud ?? controls.budgetAud,
            },
            preview.controls.proposedActivity,
          );
        }}
      />

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
        className="max-h-[88vh] gap-0 border-0 bg-transparent p-0 shadow-none data-[side=bottom]:border-t-0"
      >
        <GlassPanel
          withTextBacking
          transitioning
          className="max-h-[88vh] overflow-y-auto rounded-b-none rounded-t-3xl border-t-transparent px-5 pb-0 pt-3 shadow-none"
        >
          <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-foreground/15" />

          <SheetHeader className="mb-5 gap-0 p-0 text-left">
            <SheetTitle className="font-display text-xl">
              Your plan
            </SheetTitle>
            <SheetDescription>
              Tune availability, distance, budget and energy, or leave the
              defaults.
            </SheetDescription>
          </SheetHeader>

          {/* Mode segmented control */}
          <div className="grid grid-cols-2 gap-1 rounded-full bg-muted p-1">
            <button
              type="button"
              onClick={() => onModeChange("im_free")}
              className={cn(
                "rounded-full py-3.5 text-sm font-medium transition-colors",
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
                "rounded-full py-3.5 text-sm font-medium transition-colors",
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
                {START_OPTIONS.map((opt) => (
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

          <Field icon={<MapPin className="h-4 w-4" />} label="Travel range">
            <WheelPicker
              ariaLabel="Travel range in kilometres"
              options={TRAVEL_OPTIONS}
              value={controls.travelKm}
              onChange={(v) => onPatch({ travelKm: v })}
            />
          </Field>

          <Field icon={<Wallet className="h-4 w-4" />} label="Budget">
            <WheelPicker
              ariaLabel="Budget in dollars"
              options={BUDGET_OPTIONS}
              value={controls.budgetAud}
              onChange={(v) => onPatch({ budgetAud: v })}
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

          {/* Sticky footer: CTA stays reachable even if content ever scrolls.
              The CTA carries its own frosted backing, so no separate fade layer
              is needed behind it. This owns the panel's bottom spacing so the
              gap below the button is consistent and clears the account badge. */}
          <div className="sticky bottom-0 -mx-5 mt-5 px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4">
            <PrimaryCTA
              onClick={() => onConfirm(mode)}
              glow={false}
              fullWidth
              className={cn(
                "w-full justify-center",
                // Conform to the translucent glass surface above: drop the solid
                // accent fill/shadow for the same frosted tint + hairline border.
                "border border-white/20 bg-white/10 text-foreground shadow-none",
                "backdrop-blur-xl backdrop-saturate-150",
                "dark:border-white/10 dark:bg-white/5",
              )}
            >
              {mode === "im_free" ? "Find my people" : "Lock in my plan"}
            </PrimaryCTA>
          </div>
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
        "inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-medium transition-colors",
        active
          ? "border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--accent)]"
          : "border-border text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

/**
 * iOS-style vertical wheel picker: a compact drum of options that snaps under
 * a fixed centre band, driven by native scroll physics (momentum +
 * deceleration) via CSS scroll-snap. Rows fade and shrink away from the
 * selection, and a soft bounding box marks the scroll area. Works for any
 * discrete option list: numeric ranges or labelled choices alike.
 */
function WheelPicker<T extends string | number>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
}) {
  const ROW = 38; // px height of each row
  const VISIBLE = 3; // odd number of rows in view
  const HEIGHT = ROW * VISIBLE;
  const PAD = (HEIGHT - ROW) / 2;

  const scrollerRef = React.useRef<HTMLDivElement>(null);
  const isScrollingRef = React.useRef(false);
  const rafRef = React.useRef<number | null>(null);
  const endTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const reduceMotion = useReducedMotion();

  const selectedIndex = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );

  // Keep the scroll position aligned with the value when it changes from the
  // outside (defaults, keyboard), never while the user is scrolling.
  React.useEffect(() => {
    const el = scrollerRef.current;
    if (!el || isScrollingRef.current) return;
    const top = selectedIndex * ROW;
    if (Math.abs(el.scrollTop - top) > 1) {
      el.scrollTo({ top, behavior: reduceMotion ? "auto" : "smooth" });
    }
  }, [selectedIndex, reduceMotion]);

  const handleScroll = () => {
    const el = scrollerRef.current;
    if (!el) return;
    isScrollingRef.current = true;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      const idx = Math.max(
        0,
        Math.min(options.length - 1, Math.round(el.scrollTop / ROW)),
      );
      const next = options[idx].value;
      if (next !== value) onChange(next);
    });
    if (endTimerRef.current) clearTimeout(endTimerRef.current);
    endTimerRef.current = setTimeout(() => {
      isScrollingRef.current = false;
    }, 140);
  };

  const nudge = (dir: number) => {
    const idx = Math.max(
      0,
      Math.min(options.length - 1, selectedIndex + dir),
    );
    onChange(options[idx].value);
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-border/60 bg-foreground/[0.02]">
      <div
        className="relative select-none"
        style={{ height: HEIGHT }}
        role="slider"
        aria-label={ariaLabel}
        aria-valuemin={0}
        aria-valuemax={options.length - 1}
        aria-valuenow={selectedIndex}
        aria-valuetext={options[selectedIndex]?.label}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "ArrowUp") {
            e.preventDefault();
            nudge(-1);
          } else if (e.key === "ArrowDown") {
            e.preventDefault();
            nudge(1);
          }
        }}
      >
        {/* Soft rounded selection band the wheel snaps under. */}
        <div
          className="pointer-events-none absolute inset-x-2 top-1/2 z-0 -translate-y-1/2 rounded-xl bg-foreground/[0.06]"
          style={{ height: ROW }}
        />
        <div
          ref={scrollerRef}
          onScroll={handleScroll}
          className="relative z-10 h-full snap-y snap-mandatory overflow-y-auto overscroll-y-contain outline-none [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          style={{
            paddingBlock: PAD,
            WebkitMaskImage:
              "linear-gradient(to bottom, transparent, #000 22%, #000 78%, transparent)",
            maskImage:
              "linear-gradient(to bottom, transparent, #000 22%, #000 78%, transparent)",
          }}
        >
          {options.map((opt, i) => {
            const dist = Math.abs(i - selectedIndex);
            const selected = opt.value === value;
            return (
              <div
                key={String(opt.value)}
                className="flex snap-center items-center justify-center"
                style={{
                  height: ROW,
                  opacity: Math.max(0.25, 1 - dist * 0.32),
                  transform: `scale(${Math.max(0.84, 1 - dist * 0.07)})`,
                }}
              >
                <span
                  className={cn(
                    "tabular-nums transition-colors",
                    selected
                      ? "text-base font-semibold text-foreground"
                      : "text-sm font-medium text-muted-foreground",
                  )}
                >
                  {opt.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
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
                  We couldn&apos;t find enough compatible people right now, so
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
/* Ambient background matching the landing page's monochrome mesh treatment. */
/* ------------------------------------------------------------------ */

function Atmosphere() {
  const reduce = useReducedMotion();
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10">
      <div className="absolute inset-0 bg-black" />
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

/* ------------------------------------------------------------------ */
/* AI concierge prompt. Free-text intent ("tired, 90 minutes, want to    */
/* meet 2 people nearby") is sent to POST /api/concierge, which runs the */
/* real deterministic matcher + venue agent to build a preview without   */
/* persisting anything; the result is surfaced via onResult.             */
/* ------------------------------------------------------------------ */

function ConciergeBox({ onResult }: { onResult: (result: ConciergeResult) => void }) {
  const reduce = useReducedMotion();
  const [value, setValue] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = value.trim();
    if (!text || loading) return;

    setLoading(true);
    try {
      const res = await fetch("/api/concierge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        onResult({
          status: "error",
          message: typeof data?.error === "string" ? data.error : "Couldn't reach the concierge.",
        });
        return;
      }
      onResult(data as ConciergeResult);
    } catch {
      onResult({ status: "error", message: "Couldn't reach the concierge." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative mx-auto max-w-md">
      <GlassPanel
        withTextBacking
        backingClassName="bg-surface/50 dark:bg-surface/40"
        className="rounded-full p-1.5"
      >
        <form onSubmit={handleSubmit} className="flex items-center gap-1">
          <Sparkles
            className="ml-3 h-4 w-4 shrink-0 text-[var(--accent)]"
            aria-hidden
          />
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="I want to study with baddies near me... "
            aria-label="Tell the concierge what you're in the mood for"
            disabled={loading}
            className="min-w-0 flex-1 bg-transparent px-2 py-3 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none disabled:opacity-60"
          />
          <motion.button
            type="submit"
            aria-label="Ask the concierge"
            whileTap={reduce ? undefined : { scale: 0.92 }}
            transition={spring.snappy}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[var(--accent)] text-[var(--accent-foreground)] disabled:opacity-40"
            disabled={!value.trim() || loading}
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ArrowUp className="h-4 w-4" />
            )}
          </motion.button>
        </form>
      </GlassPanel>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Concierge result: a preview built from the real deterministic         */
/* matcher + venue agent, but nothing is persisted until "Lock it in".   */
/* ------------------------------------------------------------------ */

function ConciergePreviewCard({
  result,
  onDismiss,
  onLockIn,
}: {
  result: ConciergeResult | null;
  onDismiss: () => void;
  onLockIn: (preview: ConciergePreview) => void;
}) {
  return (
    <AnimatePresence>
      {result && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={spring.snappy}
          className="fixed inset-0 z-50 grid place-items-center bg-black/30 px-6 backdrop-blur-[2px]"
        >
          <GlassPanel
            withTextBacking
            className="w-full max-w-sm rounded-3xl p-6 text-left"
          >
            <button
              type="button"
              onClick={onDismiss}
              aria-label="Dismiss"
              className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-full text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>

            {result.status === "preview" && (
              <>
                <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--accent)]">
                  <Sparkles className="h-3.5 w-3.5" />
                  Concierge preview
                </p>
                <p className="mt-3 font-display text-lg font-semibold text-foreground">
                  {result.venue.name}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {result.groupSize} people total &middot; {result.venue.distanceKm.toFixed(1)} km away
                </p>
                <p className="mt-3 text-sm text-foreground/90">{result.explanation}</p>

                <div className="mt-4 flex items-start gap-2 rounded-2xl border border-border bg-card/60 p-3 text-sm">
                  <MessageCircle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent)]" />
                  <span className="text-foreground/90">{result.opener}</span>
                </div>

                <div className="mt-5 flex gap-2">
                  <button
                    type="button"
                    onClick={onDismiss}
                    className="flex-1 rounded-full border border-border px-4 py-2.5 text-sm font-medium text-foreground/80"
                  >
                    Never mind
                  </button>
                  <button
                    type="button"
                    onClick={() => onLockIn(result)}
                    className="flex-1 rounded-full bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-[var(--accent-foreground)]"
                  >
                    Lock it in
                  </button>
                </div>
              </>
            )}

            {result.status === "insufficient" && (
              <>
                <p className="font-display text-lg font-semibold text-foreground">
                  No group ready yet
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  Not enough people match that right now. Try again in a bit, or use &ldquo;Find
                  people now&rdquo; for a wider search.
                </p>
                <button
                  type="button"
                  onClick={onDismiss}
                  className="mt-5 rounded-full bg-[var(--accent)] px-5 py-2 text-sm font-semibold text-[var(--accent-foreground)]"
                >
                  Got it
                </button>
              </>
            )}

            {result.status === "error" && (
              <>
                <p className="font-display text-lg font-semibold text-foreground">
                  Something went wrong
                </p>
                <p className="mt-2 text-sm text-muted-foreground">{result.message}</p>
                <button
                  type="button"
                  onClick={onDismiss}
                  className="mt-5 rounded-full border border-border px-5 py-2 text-sm font-medium text-foreground/80"
                >
                  Dismiss
                </button>
              </>
            )}
          </GlassPanel>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ------------------------------------------------------------------ */
/* Selectable activity chips. Single-select with a tap-again escape     */
/* hatch back to "open to anything"; "Surprise me" is an action, not a  */
/* stored value, so it sits apart with the accent treatment.            */
/* ------------------------------------------------------------------ */

function ActivityChips({
  selected,
  onToggle,
  onSurprise,
}: {
  selected: ActivityId | null;
  onToggle: (id: ActivityId) => void;
  onSurprise: () => void;
}) {
  const reduce = useReducedMotion();
  return (
    <div
      role="group"
      aria-label="Pick an activity"
      className="mx-auto flex max-w-md flex-wrap items-center justify-center gap-2"
    >
      {ACTIVITIES.map((a) => {
        const Icon = a.Icon;
        const active = selected === a.id;
        return (
          <motion.button
            key={a.id}
            type="button"
            aria-pressed={active}
            onClick={() => onToggle(a.id)}
            whileTap={reduce ? undefined : { scale: 0.94 }}
            transition={spring.snappy}
            className={cn(
              "inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-colors",
              active
                ? a.selectedClass
                : "border-border text-muted-foreground hover:border-foreground/25 hover:text-foreground",
            )}
          >
            <Icon className="h-4 w-4" />
            {a.label}
          </motion.button>
        );
      })}

      <motion.button
        type="button"
        onClick={onSurprise}
        aria-label="Surprise me with an activity"
        whileTap={reduce ? undefined : { scale: 0.94 }}
        transition={spring.snappy}
        className={cn(
          "inline-flex min-h-11 items-center gap-1.5 rounded-full border border-dashed px-3.5 text-sm font-medium transition-colors",
          "border-[var(--accent)]/40 text-[var(--accent)] hover:border-[var(--accent)] hover:bg-[var(--accent)]/10",
        )}
      >
        <Sparkles className="h-4 w-4" />
        Surprise me
      </motion.button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Ambient glow that crossfades in behind the hero, tinted by the       */
/* chosen activity. Opacity-only per the motion rules; the colour swap   */
/* rides an AnimatePresence key so switching activities cross-dissolves. */
/* ------------------------------------------------------------------ */

function SelectionGlow({ color }: { color: string | null }) {
  const reduce = useReducedMotion();
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10">
      <AnimatePresence>
        {color && (
          <motion.div
            key={color}
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.16 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduce ? 0 : 1.1, ease: "easeInOut" }}
            className="absolute left-1/2 top-[36%] h-[75vh] w-[75vh] -translate-x-1/2 -translate-y-1/2 rounded-full blur-[130px]"
            style={{
              background: `radial-gradient(circle, ${color} 0%, transparent 70%)`,
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Live "nearby" feed of forming meetups, fed by GET /api/nearby.       */
/* Pre-acceptance privacy: no member names or photos; a silhouette       */
/* avatar stack plus the host's first name, matching the browse feed.    */
/* ------------------------------------------------------------------ */

function AvatarStack({ count }: { count: number }) {
  const shown = Math.min(Math.max(count, 0), 3);
  const extra = count - shown;
  return (
    <div className="flex -space-x-2" aria-label={`${count} going`}>
      {Array.from({ length: shown }).map((_, i) => (
        <span
          key={i}
          className="grid h-6 w-6 place-items-center rounded-full border border-card bg-muted text-muted-foreground"
        >
          <User className="h-3 w-3" />
        </span>
      ))}
      {extra > 0 && (
        <span className="grid h-6 min-w-6 place-items-center rounded-full border border-card bg-muted px-1 text-[10px] font-semibold text-muted-foreground">
          +{extra}
        </span>
      )}
    </div>
  );
}

function EventCard({ event }: { event: NearbyEvent }) {
  const reduce = useReducedMotion();
  const [requested, setRequested] = React.useState(false);
  const full = event.spotsLeft === 0;

  return (
    <motion.article
      layout
      initial={reduce ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={spring.gentle}
      className="rounded-2xl border border-border bg-card/60 p-3.5 text-left backdrop-blur-sm sm:p-4"
    >
      <div className="min-w-0">
        <h3 className="font-heading text-base font-medium leading-snug text-foreground">
          {event.title}
        </h3>
        {(event.venueName || event.hostFirstName) && (
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {[
              event.venueName,
              event.hostFirstName && `${event.hostFirstName} hosting`,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        )}
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5">
          <span className="flex items-center gap-2">
            <AvatarStack count={event.memberCount} />
            <span className="whitespace-nowrap text-xs font-medium text-foreground/80">
              {event.whenLabel}
            </span>
          </span>
          <span className="flex items-center gap-1 whitespace-nowrap text-xs text-muted-foreground">
            <MapPin className="h-3.5 w-3.5" />
            {event.distanceLabel}
          </span>
          {!full && (
            <span className="whitespace-nowrap text-xs text-muted-foreground/70">
              {event.spotsLeft} {event.spotsLeft === 1 ? "spot" : "spots"} left
            </span>
          )}
        </div>
        <motion.button
          type="button"
          aria-label={`${requested ? "Requested to join" : full ? "Full" : "Join"} ${event.title}`}
          onClick={() => setRequested(true)}
          disabled={requested || full}
          whileTap={reduce || requested || full ? undefined : { scale: 0.94 }}
          transition={spring.snappy}
          className={cn(
            "min-h-12 min-w-20 shrink-0 rounded-full px-5 text-sm font-semibold transition-colors",
            requested
              ? "bg-cat-sage/20 text-cat-foreground"
              : full
                ? "cursor-not-allowed border border-border text-muted-foreground"
                : "bg-[var(--accent)] text-[var(--accent-foreground)] hover:bg-[var(--accent-hover)]",
          )}
        >
          {requested ? "Requested" : full ? "Full" : "Join"}
        </motion.button>
      </div>
    </motion.article>
  );
}

function FeedSkeleton() {
  return (
    <div className="mt-12" aria-hidden>
      <div className="mb-3 h-3 w-24 rounded bg-foreground/10" />
      <div className="flex flex-col gap-3">
        {[0, 1].map((i) => (
          <div
            key={i}
            className="h-28 animate-pulse rounded-2xl border border-border bg-card/40"
          />
        ))}
      </div>
    </div>
  );
}

function NearbyFeed({
  events,
  loaded,
  reduce,
}: {
  events: NearbyEvent[];
  loaded: boolean;
  reduce: boolean;
}) {
  if (!loaded) return <FeedSkeleton />;
  if (events.length === 0) return null;

  return (
    <motion.section
      initial={reduce ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4, delay: 0.15 }}
      className="mt-12"
    >
      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Live nearby
        </h2>
      </div>
      <div className="flex flex-col gap-3">
        {events.map((event) => (
          <EventCard key={event.id} event={event} />
        ))}
      </div>
    </motion.section>
  );
}
