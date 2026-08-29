// `areaLat`/`areaLng` are being added to `Preferences` by a parallel-session
// migration (0002) — declared locally here ahead of that type landing.
// Nothing is renamed on `Preferences`, so this unifies cleanly once it does.
import type { Preferences, Profile } from "@/lib/types"
import { EXPLORATION_POLICY, MATCH_WEIGHTS } from "@/lib/config"

export interface ScoreResult {
  score: number
  breakdown: Record<string, number>
  reasons: string[]
}

type GeoPreferences = { areaLat?: number | null; areaLng?: number | null }
type ActiveUser = Profile & Preferences & GeoPreferences & { completedMeetups: number }
type Candidate = Profile & Preferences & GeoPreferences

export interface ScoreContext {
  candidatePriorFeedback?: number
  candidateReliability?: number
  availabilityOverlapRatio?: number
}

type SignalKey = keyof typeof MATCH_WEIGHTS

const REASONS: Record<SignalKey, string> = {
  sharedInterests: "You share several interests and hobbies",
  availabilityOverlap: "Your availability lines up well",
  travelPracticality: "Travel distance works well for both of you",
  budgetFit: "Your budgets are a good fit",
  socialGroupFit: "Your social energy matches",
  previousFeedback: "Positive feedback from previous meetups",
  privateReliability: "Reliable track record",
}

const REASON_THRESHOLD = 0.6
const BUDGET_REFERENCE_AUD = 50
const DEFAULT_SUBSCORE = 0.5
const EARTH_RADIUS_KM = 6371

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}

function jaccard(a: string[], b: string[]): number {
  const setA = new Set(a)
  const setB = new Set(b)
  const union = new Set([...setA, ...setB])
  if (union.size === 0) return 0
  let intersectionSize = 0
  for (const item of setA) {
    if (setB.has(item)) intersectionSize++
  }
  return intersectionSize / union.size
}

function closeness(a: number | null, b: number | null, reference: number): number {
  if (a === null || b === null) return 1
  return clamp01(1 - Math.abs(a - b) / reference)
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function scoreSharedInterests(activeUser: ActiveUser, candidate: Candidate): number {
  return jaccard(
    [...activeUser.interests, ...activeUser.hobbies],
    [...candidate.interests, ...candidate.hobbies]
  )
}

function scoreAvailabilityOverlap(ctx?: ScoreContext): number {
  return clamp01(ctx?.availabilityOverlapRatio ?? DEFAULT_SUBSCORE)
}

function scoreTravelPracticality(activeUser: ActiveUser, candidate: Candidate): number {
  const effectiveRadius = closenessRadius(activeUser.travelKm, candidate.travelKm)
  if (effectiveRadius === null) return 1
  if (
    activeUser.areaLat == null ||
    activeUser.areaLng == null ||
    candidate.areaLat == null ||
    candidate.areaLng == null
  ) {
    return DEFAULT_SUBSCORE
  }
  const distanceKm = haversineKm(activeUser.areaLat, activeUser.areaLng, candidate.areaLat, candidate.areaLng)
  if (effectiveRadius === 0) return distanceKm === 0 ? 1 : 0
  return clamp01(1 - distanceKm / effectiveRadius)
}

function closenessRadius(a: number | null, b: number | null): number | null {
  if (a === null && b === null) return null
  if (a === null) return b
  if (b === null) return a
  return Math.min(a, b)
}

function scoreBudgetFit(activeUser: ActiveUser, candidate: Candidate): number {
  return closeness(activeUser.budgetAud, candidate.budgetAud, BUDGET_REFERENCE_AUD)
}

function scoreSocialGroupFit(activeUser: ActiveUser, candidate: Candidate): number {
  if (!activeUser.socialEnergy || !candidate.socialEnergy) return DEFAULT_SUBSCORE
  return activeUser.socialEnergy === candidate.socialEnergy ? 1 : 0
}

function scorePreviousFeedback(ctx?: ScoreContext): number {
  return clamp01(ctx?.candidatePriorFeedback ?? DEFAULT_SUBSCORE)
}

function scorePrivateReliability(ctx?: ScoreContext): number {
  return clamp01(ctx?.candidateReliability ?? DEFAULT_SUBSCORE)
}

export function scoreCandidate(activeUser: ActiveUser, candidate: Candidate, ctx?: ScoreContext): ScoreResult {
  const subscores: Record<SignalKey, number> = {
    sharedInterests: scoreSharedInterests(activeUser, candidate),
    availabilityOverlap: scoreAvailabilityOverlap(ctx),
    travelPracticality: scoreTravelPracticality(activeUser, candidate),
    budgetFit: scoreBudgetFit(activeUser, candidate),
    socialGroupFit: scoreSocialGroupFit(activeUser, candidate),
    previousFeedback: scorePreviousFeedback(ctx),
    privateReliability: scorePrivateReliability(ctx),
  }

  const signalKeys = Object.keys(MATCH_WEIGHTS) as SignalKey[]
  const breakdown: Record<string, number> = {}
  let score = 0
  for (const key of signalKeys) {
    const contribution = subscores[key] * MATCH_WEIGHTS[key]
    breakdown[key] = contribution
    score += contribution
  }
  score = clamp01(score)

  const reasons = signalKeys
    .filter((key) => subscores[key] >= REASON_THRESHOLD)
    .sort((a, b) => breakdown[b] - breakdown[a])
    .map((key) => REASONS[key])

  return { score, breakdown, reasons }
}

export function explorationFactor(completedMeetups: number): { familiar: number; exploratory: number } {
  return completedMeetups >= 3
    ? { ...EXPLORATION_POLICY.afterThreeMeetups }
    : { ...EXPLORATION_POLICY.initial }
}
