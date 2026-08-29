import { describe, expect, it } from "vitest"
import type { AvailabilityWindow, Preferences, Profile } from "@/lib/types"
import { passesGates, type GateContext } from "@/lib/matcher/gates"

type ActiveUser = GateContext["activeUser"] & { availability: AvailabilityWindow[] }
type Candidate = Parameters<typeof passesGates>[0]

function makeProfile(userId: string): Profile {
  return {
    userId,
    firstName: "Test",
    photoUrl: null,
    ageRange: "18-24",
    university: "Test University",
    courseYear: null,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  }
}

function makePreferences(userId: string): Preferences {
  return {
    userId,
    travelKm: 10,
    budgetAud: 20,
    hobbies: ["hiking"],
    interests: ["coffee"],
    genderPref: null,
    languagePref: null,
    accessibility: null,
    socialEnergy: null,
    weeklyGoal: null,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  }
}

function makeWindow(userId: string, startAt: string, endAt: string): AvailabilityWindow {
  return {
    id: `${userId}-window`,
    userId,
    startAt,
    endAt,
    mode: "im_free",
    createdAt: "2026-01-01T00:00:00Z",
  }
}

function makeActiveUser(overrides: Partial<ActiveUser> = {}): ActiveUser {
  return {
    ...makeProfile("active-1"),
    ...makePreferences("active-1"),
    verified: true,
    ageOk: true,
    availability: [makeWindow("active-1", "2026-08-29T18:00:00Z", "2026-08-29T20:00:00Z")],
    ...overrides,
  }
}

function makeCandidate(overrides: Partial<Candidate> = {}): Candidate {
  return {
    ...makeProfile("cand-1"),
    ...makePreferences("cand-1"),
    verified: true,
    ageOk: true,
    availability: [makeWindow("cand-1", "2026-08-29T19:00:00Z", "2026-08-29T21:00:00Z")],
    safetyProhibited: false,
    accessibilityMet: true,
    activityAllowed: true,
    ...overrides,
  }
}

function makeCtx(overrides: Partial<GateContext> = {}): GateContext {
  return {
    activeUser: makeActiveUser(),
    blockedPairs: [],
    now: new Date("2026-08-29T12:00:00Z"),
    ...overrides,
  }
}

describe("passesGates", () => {
  it("rejects an unverified candidate", () => {
    const result = passesGates(makeCandidate({ verified: false }), makeActiveUser(), makeCtx())
    expect(result.ok).toBe(false)
    expect(result.reasons.some((r) => r.toLowerCase().includes("verified"))).toBe(true)
  })

  it("rejects an under-18 candidate", () => {
    const result = passesGates(makeCandidate({ ageOk: false }), makeActiveUser(), makeCtx())
    expect(result.ok).toBe(false)
    expect(result.reasons.some((r) => r.toLowerCase().includes("age"))).toBe(true)
  })

  it("rejects when there is no availability overlap with the active user", () => {
    const candidate = makeCandidate({
      availability: [makeWindow("cand-1", "2026-08-30T19:00:00Z", "2026-08-30T21:00:00Z")],
    })
    const result = passesGates(candidate, makeActiveUser(), makeCtx())
    expect(result.ok).toBe(false)
    expect(result.reasons.some((r) => r.toLowerCase().includes("availability"))).toBe(true)
  })

  it("rejects a mutually blocked pair", () => {
    const result = passesGates(
      makeCandidate(),
      makeActiveUser(),
      makeCtx({ blockedPairs: [["active-1", "cand-1"]] })
    )
    expect(result.ok).toBe(false)
    expect(result.reasons.some((r) => r.toLowerCase().includes("block"))).toBe(true)
  })

  it("rejects a candidate whose safety status prohibits matching", () => {
    const result = passesGates(makeCandidate({ safetyProhibited: true }), makeActiveUser(), makeCtx())
    expect(result.ok).toBe(false)
    expect(result.reasons.some((r) => r.toLowerCase().includes("safety"))).toBe(true)
  })

  it("rejects a candidate whose accessibility needs cannot be met", () => {
    const result = passesGates(makeCandidate({ accessibilityMet: false }), makeActiveUser(), makeCtx())
    expect(result.ok).toBe(false)
    expect(result.reasons.some((r) => r.toLowerCase().includes("accessibility"))).toBe(true)
  })

  it("rejects a candidate whose proposed activity is outside the allowed activity policy", () => {
    const result = passesGates(makeCandidate({ activityAllowed: false }), makeActiveUser(), makeCtx())
    expect(result.ok).toBe(false)
    expect(result.reasons.some((r) => r.toLowerCase().includes("activity"))).toBe(true)
  })

  it("accepts a fully-eligible candidate", () => {
    const result = passesGates(makeCandidate(), makeActiveUser(), makeCtx())
    expect(result.ok).toBe(true)
    expect(result.reasons).toEqual([])
  })
})
