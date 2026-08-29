"use client"

import * as React from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { CalendarClock, Check, RefreshCw, TriangleAlert } from "lucide-react"

import { AgentProgress, type AgentStep, type MapPin } from "@/components/AgentProgress"
import { GroupPreview } from "@/components/GroupPreview"
import { ProposalCard } from "@/components/ProposalCard"
import { PrimaryCTA } from "@/components/motion/PrimaryCTA"
import { spring } from "@/components/motion/tokens"
import { Button } from "@/components/ui/button"
import { getMeetupGroup, getVenueDetail, type VenueDetail } from "./actions"

// The demo group's campus area (seed.sql — Alex Chen's `area_lat/area_lng`,
// shared by most seeded meetups). Only used to frame the map when the match
// flow doesn't hand back a centroid; the venue pin itself is always the
// real Places coordinate.
const DEMO_AREA = { lat: -33.8886, lng: 151.1873 }

const SKELETON_STEPS: AgentStep[] = [
  { key: "plan", label: "Analyzing group interests", status: "pending" },
  { key: "search", label: "Searching Google Places", status: "pending" },
  { key: "candidates", label: "Finding venue candidates", status: "pending" },
  { key: "rank", label: "Ranking by fit", status: "pending" },
  { key: "selected", label: "Selecting the best match", status: "pending" },
]

interface AnonMember {
  verified: boolean
  ageRange: string | null
  sharedInterests: string[]
}

interface MatchReady {
  meetupId: string
  status: "ready"
  groupSize: number
  genderMix: string
  members: AnonMember[]
  explanation: string[]
}

interface MatchInsufficient {
  status: "insufficient"
  nearestFuture: { startAt: string } | null
  suggestion: {
    meetupId: string
    activityIntent: string | null
    tags: string[] | null
    scheduledAt: string | null
  } | null
}

interface Recommendation {
  activityTitle: string
  placeId: string
  venueName: string
  reason: string
  estimatedCostAud: number
  estimatedDistanceKm: number
  overBudgetPreference: boolean
  overDistancePreference: boolean
  bookingRequired: boolean
  bookingUrl: string | null
  confidence: number
}

interface VenueAgentResponse {
  recommendation: Recommendation
  steps: AgentStep[]
  source: "live" | "fallback"
}

interface GroupState {
  meetupId: string
  groupSize: number
  genderMix: string
  members: AnonMember[]
  explanation: string[]
}

type Phase =
  | "loading"
  | "running"
  | "proposal"
  | "confirming"
  | "waiting"
  | "insufficient"
  | "error"

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function cleanGenderMix(raw: string): string {
  return raw.startsWith("not tracked") ? "mixed" : raw
}

function formatTime(iso: string): string {
  return new Intl.DateTimeFormat("en-AU", {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso))
}

export default function MatchPage() {
  return (
    <React.Suspense fallback={<Centered>Setting up your match…</Centered>}>
      <MatchFlow />
    </React.Suspense>
  )
}

function MatchFlow() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const reduce = useReducedMotion()

  const [phase, setPhase] = React.useState<Phase>("loading")
  const [steps, setSteps] = React.useState<AgentStep[]>(() =>
    SKELETON_STEPS.map((s, i) => ({ ...s, status: i === 0 ? "active" : "pending" }))
  )
  const [pins, setPins] = React.useState<MapPin[]>([])
  const [center, setCenter] = React.useState(DEMO_AREA)

  const [group, setGroup] = React.useState<GroupState | null>(null)
  const [recommendation, setRecommendation] = React.useState<Recommendation | null>(null)
  const [venueDetail, setVenueDetail] = React.useState<VenueDetail | null>(null)
  const [source, setSource] = React.useState<"live" | "fallback">("live")

  const [insufficient, setInsufficient] = React.useState<MatchInsufficient | null>(null)
  const [rerollUsed, setRerollUsed] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [actionError, setActionError] = React.useState<string | null>(null)

  const [tally, setTally] = React.useState({ accepted: 0, quorum: 3, confirmed: false })

  const started = React.useRef(false)

  const runAgentAnimation = React.useCallback(
    async (realSteps: AgentStep[], detail: VenueDetail | null, rec: Recommendation) => {
      const stepMs = reduce ? 120 : 620
      for (let i = 2; i < realSteps.length; i++) {
        setSteps(
          realSteps.map((s, j) => ({
            ...s,
            status: j < i ? "done" : j === i ? "active" : "pending",
          }))
        )
        if (
          (realSteps[i].key === "candidates" || realSteps[i].key === "selected") &&
          detail?.lat != null &&
          detail?.lng != null
        ) {
          setPins([
            {
              placeId: rec.placeId,
              lat: detail.lat,
              lng: detail.lng,
              label: rec.venueName,
              selected: true,
            },
          ])
        }
        await sleep(stepMs)
      }
      setSteps(realSteps.map((s) => ({ ...s, status: "done" })))
    },
    [reduce]
  )

  React.useEffect(() => {
    if (started.current) return
    started.current = true

    async function run() {
      try {
        // 1 — resolve the forming meetup + anonymised group.
        let resolved: GroupState

        const paramMeetupId = searchParams.get("meetupId")
        if (paramMeetupId) {
          const g = await getMeetupGroup(paramMeetupId)
          if (!g) {
            setPhase("error")
            return
          }
          if (g.center) setCenter(g.center)
          resolved = {
            meetupId: g.meetupId,
            groupSize: g.groupSize,
            genderMix: "mixed",
            members: g.members,
            explanation: g.explanation,
          }
        } else {
          const res = await fetch("/api/match", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{}",
          })
          if (!res.ok) {
            setPhase("error")
            return
          }
          const data = (await res.json()) as MatchReady | MatchInsufficient
          if (data.status === "insufficient") {
            setInsufficient(data)
            setPhase("insufficient")
            return
          }
          resolved = {
            meetupId: data.meetupId,
            groupSize: data.groupSize,
            genderMix: cleanGenderMix(data.genderMix),
            members: data.members,
            explanation: data.explanation,
          }
        }

        setGroup(resolved)
        setSteps(
          SKELETON_STEPS.map((s, i) => ({
            ...s,
            status: i === 0 ? "done" : i === 1 ? "active" : "pending",
          }))
        )
        setPhase("running")

        // 2 — run the venue agent against the real meetup.
        const vaRes = await fetch("/api/venue-agent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ meetupId: resolved.meetupId }),
        })
        if (!vaRes.ok) {
          setPhase("error")
          return
        }
        const va = (await vaRes.json()) as VenueAgentResponse

        // 3 — resolve the winning venue's coordinates + address from Places.
        const detail = await getVenueDetail(va.recommendation.placeId)

        // 4 — play the returned steps + drop the venue pin.
        await runAgentAnimation(va.steps, detail, va.recommendation)

        setRecommendation(va.recommendation)
        setVenueDetail(detail)
        setSource(va.source)
        setPhase("proposal")
      } catch {
        setPhase("error")
      }
    }

    void run()
  }, [searchParams, runAgentAnimation])

  async function onReroll() {
    if (!group || busy || rerollUsed) return
    setBusy(true)
    setActionError(null)
    try {
      const res = await fetch(`/api/meetups/${group.meetupId}/reroll`, { method: "POST" })
      if (res.status === 409) {
        setRerollUsed(true)
        return
      }
      if (!res.ok) {
        setActionError("Couldn't reroll just now — keeping the current pick.")
        return
      }
      const va = (await res.json()) as VenueAgentResponse
      const detail = await getVenueDetail(va.recommendation.placeId)
      setRecommendation(va.recommendation)
      setVenueDetail(detail)
      setSource(va.source)
      setSteps(va.steps.map((s) => ({ ...s, status: "done" })))
      setPins(
        detail?.lat != null && detail?.lng != null
          ? [
              {
                placeId: va.recommendation.placeId,
                lat: detail.lat,
                lng: detail.lng,
                label: va.recommendation.venueName,
                selected: true,
              },
            ]
          : []
      )
      setRerollUsed(true)
    } catch {
      setActionError("Couldn't reroll just now — keeping the current pick.")
    } finally {
      setBusy(false)
    }
  }

  async function onAccept() {
    if (!group || busy) return
    setBusy(true)
    setActionError(null)
    setPhase("confirming")
    try {
      const res = await fetch(`/api/meetups/${group.meetupId}/accept`, { method: "POST" })
      if (!res.ok) {
        setActionError("Couldn't record your acceptance — try again.")
        setPhase("proposal")
        return
      }
      const data = (await res.json()) as {
        acceptedCount: number
        memberCount: number
        quorum: number
        confirmed: boolean
      }

      const target = data.confirmed
        ? Math.max(data.acceptedCount, data.quorum)
        : data.acceptedCount
      setTally({ accepted: 0, quorum: data.quorum, confirmed: false })
      for (let n = 1; n <= target; n++) {
        setTally({ accepted: n, quorum: data.quorum, confirmed: false })
        await sleep(reduce ? 90 : 260)
      }
      setTally({ accepted: target, quorum: data.quorum, confirmed: data.confirmed })
      await sleep(reduce ? 150 : 650)

      if (data.confirmed) {
        router.push(`/meetup/${group.meetupId}`)
      } else {
        setPhase("waiting")
      }
    } catch {
      setActionError("Couldn't record your acceptance — try again.")
      setPhase("proposal")
    } finally {
      setBusy(false)
    }
  }

  const showProgress = phase === "loading" || phase === "running" || phase === "proposal"

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-6 px-4 py-8 sm:px-6">
      <header className="flex flex-col gap-1">
        <Link href="/home" className="text-sm text-muted-foreground hover:text-foreground">
          ← Back
        </Link>
        <h1 className="font-display text-2xl font-semibold text-foreground">
          {phase === "proposal" || phase === "confirming"
            ? "Your plan is ready"
            : phase === "waiting"
              ? "Your group is still forming"
            : "Finding your group"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {phase === "proposal" || phase === "confirming"
            ? "Review the group and the venue, then lock it in."
            : phase === "waiting"
              ? "Your acceptance is saved while matching stays open."
            : "Matching compatible students, then sending an AI agent to find a real venue."}
        </p>
      </header>

      {showProgress && (
        <AgentProgress steps={steps} pins={pins} center={center} boundsKm={6} />
      )}

      {source === "fallback" && (phase === "proposal" || phase === "confirming") && (
        <div
          className="flex items-start gap-3 rounded-xl border border-accent/25 bg-accent/10 px-4 py-3"
          role="status"
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-accent-hover dark:text-accent" aria-hidden />
          <div className="flex flex-col gap-0.5">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent-hover dark:text-accent">
              Cached demo result
            </p>
            <p className="text-sm text-foreground/80">
              Here&apos;s a saved venue recommendation while live search is unavailable.
            </p>
          </div>
        </div>
      )}

      <AnimatePresence mode="wait">
        {phase === "proposal" && group && recommendation && (
          <motion.div
            key="proposal"
            className="flex flex-col gap-4"
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 16 }}
            animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0 }}
            transition={reduce ? { duration: 0.15 } : spring.gentle}
          >
            <ProposalCard
              activityTitle={recommendation.activityTitle}
              venueName={recommendation.venueName}
              address={venueDetail?.address ?? ""}
              photoUrl={venueDetail?.photoUrl ?? null}
              openNow={venueDetail?.openNow ?? null}
              estimatedDistanceKm={recommendation.estimatedDistanceKm}
              estimatedCostAud={
                source === "fallback" ? undefined : recommendation.estimatedCostAud
              }
              reason={recommendation.reason}
              overBudgetPreference={recommendation.overBudgetPreference}
              overDistancePreference={recommendation.overDistancePreference}
              mapsUrl={venueDetail?.mapsUrl ?? null}
              bookingUrl={source === "fallback" ? null : recommendation.bookingUrl}
            />

            <GroupPreview
              size={group.groupSize}
              genderMix={group.genderMix}
              ageRanges={[...new Set(group.members.map((m) => m.ageRange).filter((v): v is string => Boolean(v)))]}
              sharedInterests={[...new Set(group.members.flatMap((m) => m.sharedInterests))]}
              verifiedCount={group.members.filter((m) => m.verified).length + 1}
              compatibilityReason={group.explanation.join(" ")}
            />

            {actionError && (
              <p className="text-xs font-medium text-destructive">{actionError}</p>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <PrimaryCTA onClick={onAccept} disabled={busy}>
                <Check className="size-4" aria-hidden />
                Accept plan
              </PrimaryCTA>
              <Button
                variant="outline"
                onClick={onReroll}
                disabled={busy || rerollUsed}
                aria-label={rerollUsed ? "Reroll already used" : "Reroll once for a different venue"}
              >
                <RefreshCw className="size-4" aria-hidden />
                {rerollUsed ? "Reroll used" : "Reroll once"}
              </Button>
            </div>
            {rerollUsed && (
              <p className="text-xs text-muted-foreground">
                You&apos;ve used your one reroll — the next pick stands.
              </p>
            )}
          </motion.div>
        )}

        {phase === "confirming" && (
          <motion.div
            key="confirming"
            className="flex flex-col items-center gap-4 rounded-2xl bg-card p-8 text-center ring-1 ring-foreground/10"
            initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96 }}
            animate={reduce ? { opacity: 1 } : { opacity: 1, scale: 1 }}
            transition={reduce ? { duration: 0.15 } : spring.gentle}
          >
            <div
              className={`grid size-14 place-items-center rounded-full ${
                tally.confirmed ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground"
              }`}
            >
              {tally.confirmed ? (
                <Check className="size-7" strokeWidth={3} aria-hidden />
              ) : (
                <CalendarClock className="size-6" aria-hidden />
              )}
            </div>
            <div>
              <p className="font-display text-xl font-semibold text-foreground">
                {tally.confirmed ? "Quorum reached" : "Locking in the group…"}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {tally.accepted} of {tally.quorum} accepted
              </p>
            </div>
          </motion.div>
        )}

        {phase === "waiting" && (
          <motion.div
            key="waiting"
            className="flex flex-col gap-4 rounded-2xl border border-accent/25 bg-card p-5"
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 16 }}
            animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0 }}
            transition={reduce ? { duration: 0.15 } : spring.gentle}
          >
            <div className="flex items-start gap-3 rounded-xl bg-accent/10 px-4 py-3">
              <CalendarClock
                className="mt-0.5 size-4 shrink-0 text-accent-hover dark:text-accent"
                aria-hidden
              />
              <div className="flex flex-col gap-0.5">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent-hover dark:text-accent">
                  Matching stays open
                </p>
                <p className="text-sm text-foreground/80">
                  This group has not reached quorum yet. We&apos;ll keep looking for
                  compatible members without revealing anyone&apos;s identity.
                </p>
              </div>
            </div>

            <p className="text-sm text-muted-foreground">
              Your acceptance is saved. You can wait for this group or browse the closest
              available future meetups.
            </p>
            <p className="text-sm font-medium text-foreground">
              {tally.accepted} of {tally.quorum} acceptances received
            </p>

            <div className="flex flex-wrap items-center gap-3">
              <Button variant="outline" render={<Link href="/home" />}>
                Keep waiting
              </Button>
              <Button variant="outline" render={<Link href="/meetups" />}>
                Browse future meetups
              </Button>
            </div>
          </motion.div>
        )}

        {phase === "insufficient" && (
          <motion.div
            key="insufficient"
            className="flex flex-col gap-4 rounded-2xl border border-accent/25 bg-card p-5"
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 16 }}
            animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0 }}
            transition={reduce ? { duration: 0.15 } : spring.gentle}
          >
            <div className="flex items-start gap-3 rounded-xl bg-accent/10 px-4 py-3">
              <CalendarClock
                className="mt-0.5 size-4 shrink-0 text-accent-hover dark:text-accent"
                aria-hidden
              />
              <div className="flex flex-col gap-0.5">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent-hover dark:text-accent">
                  Interest pool
                </p>
                <p className="text-sm font-medium text-foreground">No group is ready yet</p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              Not enough compatible students are free right now. We&apos;ve added you to the
              interest pool and will match you as soon as a group forms.
            </p>
            {insufficient?.nearestFuture && (
              <p className="text-sm text-foreground">
                Nearest compatible time:{" "}
                <span className="font-medium">{formatTime(insufficient.nearestFuture.startAt)}</span>
              </p>
            )}
            {insufficient?.suggestion && (
              <Link
                href={`/meetup/${insufficient.suggestion.meetupId}`}
                className="mt-1 inline-flex w-fit items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium hover:bg-muted"
              >
                <CalendarClock className="size-4" aria-hidden />
                {insufficient.suggestion.activityIntent ?? "Join a student-created meetup instead"}
              </Link>
            )}
          </motion.div>
        )}

        {phase === "error" && (
          <motion.div
            key="error"
            className="flex flex-col items-start gap-3 rounded-2xl bg-card p-5 ring-1 ring-foreground/10"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <p className="flex items-center gap-2 text-sm font-medium text-destructive">
              <TriangleAlert className="size-4 shrink-0" aria-hidden />
              Something went wrong setting up your match
            </p>
            <p className="text-sm text-muted-foreground">
              The matcher or venue agent didn&apos;t respond. Try again in a moment.
            </p>
            <Button variant="outline" onClick={() => window.location.reload()}>
              <RefreshCw className="size-4" aria-hidden />
              Retry
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  )
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl items-center justify-center px-4 text-sm text-muted-foreground">
      {children}
    </main>
  )
}
