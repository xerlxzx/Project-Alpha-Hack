import type { AvailabilityWindow, Preferences, Profile } from "@/lib/types"

type RuntimeFlags = { verified: boolean; ageOk: boolean }

export interface GateContext {
  activeUser: Profile & Preferences & RuntimeFlags
  blockedPairs: Array<[string, string]>
  now: Date
}

type Candidate = Profile &
  Preferences &
  RuntimeFlags & {
    availability: AvailabilityWindow[]
    safetyProhibited: boolean
    accessibilityMet: boolean
    activityAllowed: boolean
  }

type ActiveUser = GateContext["activeUser"] & { availability: AvailabilityWindow[] }

function overlaps(a: AvailabilityWindow[], b: AvailabilityWindow[]): boolean {
  return a.some((windowA) =>
    b.some(
      (windowB) =>
        new Date(windowA.startAt) < new Date(windowB.endAt) &&
        new Date(windowB.startAt) < new Date(windowA.endAt)
    )
  )
}

function isBlocked(blockedPairs: Array<[string, string]>, userA: string, userB: string): boolean {
  return blockedPairs.some(
    ([x, y]) => (x === userA && y === userB) || (x === userB && y === userA)
  )
}

export function passesGates(
  candidate: Candidate,
  activeUser: ActiveUser,
  ctx: GateContext
): { ok: boolean; reasons: string[] } {
  const reasons: string[] = []

  if (!candidate.verified) {
    reasons.push("Candidate is not verified")
  }
  if (!candidate.ageOk) {
    reasons.push("Candidate does not meet the minimum age requirement")
  }
  if (!overlaps(candidate.availability, activeUser.availability)) {
    reasons.push("No availability overlap with active user")
  }
  if (isBlocked(ctx.blockedPairs, activeUser.userId, candidate.userId)) {
    reasons.push("Users have blocked one another")
  }
  if (candidate.safetyProhibited) {
    reasons.push("Candidate safety status prohibits matching")
  }
  if (!candidate.accessibilityMet) {
    reasons.push("Candidate accessibility needs cannot be met")
  }
  if (!candidate.activityAllowed) {
    reasons.push("Proposed activity is outside the allowed activity policy")
  }

  return { ok: reasons.length === 0, reasons }
}
