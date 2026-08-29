import type { AvailabilityWindow, Preferences, Profile } from "@/lib/types"
import { passesGates, type GateContext } from "@/lib/matcher/gates"
import { scoreCandidate } from "@/lib/matcher/score"

type RuntimeFlags = { id: string; verified: boolean; ageOk: boolean }

type ActiveUser = Profile &
  Preferences &
  RuntimeFlags & {
    completedMeetups: number
    availability: AvailabilityWindow[]
  }

type PoolMember = Profile &
  Preferences &
  RuntimeFlags & {
    safetyProhibited: boolean
    accessibilityMet: boolean
    activityAllowed: boolean
    availability: AvailabilityWindow[]
    priorFeedback?: number
    reliability?: number
  }

export interface MatchResult {
  status: "ready" | "insufficient"
  members: Array<{ userId: string; score: number; reasons: string[] }>
  explanation: string[]
}

const GROUP_MIN = 3
const GROUP_TARGET = 4
const GROUP_MAX = 6

const GENDER_PLURALS: Record<string, string> = {
  man: "men",
  woman: "women",
}

export function describeGenderMix(genders: Array<string | null | undefined>): string {
  const counts = new Map<string, number>()
  for (const gender of genders) {
    const label = gender?.trim().toLowerCase() || "undisclosed"
    counts.set(label, (counts.get(label) ?? 0) + 1)
  }

  return [...counts.entries()]
    .sort(([labelA, countA], [labelB, countB]) => {
      if (labelA === "undisclosed") return 1
      if (labelB === "undisclosed") return -1
      return countB - countA || labelA.localeCompare(labelB)
    })
    .map(([label, count]) => {
      const displayLabel = count === 1 ? label : (GENDER_PLURALS[label] ?? label)
      return `${count} ${displayLabel}`
    })
    .join(", ")
}

function windowOverlapMs(a: AvailabilityWindow, b: AvailabilityWindow): number {
  const start = Math.max(new Date(a.startAt).getTime(), new Date(b.startAt).getTime())
  const end = Math.min(new Date(a.endAt).getTime(), new Date(b.endAt).getTime())
  return Math.max(0, end - start)
}

function totalDurationMs(windows: AvailabilityWindow[]): number {
  return windows.reduce((sum, w) => sum + Math.max(0, new Date(w.endAt).getTime() - new Date(w.startAt).getTime()), 0)
}

function availabilityOverlapRatio(a: AvailabilityWindow[], b: AvailabilityWindow[]): number {
  const denom = Math.min(totalDurationMs(a), totalDurationMs(b))
  if (denom <= 0) return 0
  let overlapMs = 0
  for (const windowA of a) {
    for (const windowB of b) {
      overlapMs += windowOverlapMs(windowA, windowB)
    }
  }
  return Math.min(1, Math.max(0, overlapMs / denom))
}

export function buildMatch(
  activeUser: ActiveUser,
  pool: PoolMember[],
  ctx: { blockedPairs: Array<[string, string]>; now: Date; relaxAvailability?: boolean }
): MatchResult {
  const gateCtx: GateContext = {
    activeUser,
    blockedPairs: ctx.blockedPairs,
    now: ctx.now,
    relaxAvailability: ctx.relaxAvailability,
  }

  const scored = pool
    .filter((candidate) => passesGates(candidate, activeUser, gateCtx).ok)
    .map((candidate) => {
      const overlapRatio = availabilityOverlapRatio(activeUser.availability, candidate.availability)
      const result = scoreCandidate(activeUser, candidate, {
        availabilityOverlapRatio: overlapRatio,
        candidatePriorFeedback: candidate.priorFeedback,
        candidateReliability: candidate.reliability,
      })
      return { userId: candidate.userId, score: result.score, reasons: result.reasons }
    })
    .sort((a, b) => b.score - a.score)

  if (scored.length < GROUP_MIN) {
    return { status: "insufficient", members: [], explanation: [] }
  }

  const groupSize = Math.min(scored.length, GROUP_TARGET, GROUP_MAX)
  const members = scored.slice(0, groupSize)

  const reasonCounts = new Map<string, number>()
  for (const member of members) {
    for (const reason of member.reasons) {
      reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1)
    }
  }
  const explanation = [...reasonCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([reason]) => reason)

  return { status: "ready", members, explanation }
}
