import { describe, expect, it } from "vitest"
import type { Preferences, Profile } from "@/lib/types"
import { EXPLORATION_POLICY, MATCH_WEIGHTS } from "@/lib/config"
import { explorationFactor, scoreCandidate } from "@/lib/matcher/score"

type ActiveUser = Parameters<typeof scoreCandidate>[0]
type Candidate = Parameters<typeof scoreCandidate>[1]

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

// `areaLat`/`areaLng` are landing on `Preferences` via a parallel migration
// (see score.ts header comment) — included here ahead of that type update.
type PreferencesWithGeo = Preferences & { areaLat?: number | null; areaLng?: number | null }

function makePreferences(userId: string, overrides: Partial<PreferencesWithGeo> = {}): PreferencesWithGeo {
  return {
    userId,
    travelKm: 10,
    budgetAud: 20,
    hobbies: ["hiking", "boardgames"],
    interests: ["coffee", "music"],
    genderPref: null,
    languagePref: null,
    accessibility: null,
    socialEnergy: "moderate",
    weeklyGoal: null,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    areaLat: -33.888,
    areaLng: 151.187,
    ...overrides,
  }
}

function makeActiveUser(overrides: Partial<PreferencesWithGeo> = {}, completedMeetups = 0): ActiveUser {
  return {
    ...makeProfile("active-1"),
    ...makePreferences("active-1", overrides),
    completedMeetups,
  }
}

function makeCandidate(overrides: Partial<PreferencesWithGeo> = {}): Candidate {
  return {
    ...makeProfile("cand-1"),
    ...makePreferences("cand-1", overrides),
  }
}

describe("scoreCandidate", () => {
  it("scores a candidate sharing many interests higher than one sharing none", () => {
    const activeUser = makeActiveUser()
    const closeCandidate = makeCandidate({ hobbies: ["hiking", "boardgames"], interests: ["coffee", "music"] })
    const distantCandidate = makeCandidate({ hobbies: ["pottery"], interests: ["skydiving"] })

    const closeResult = scoreCandidate(activeUser, closeCandidate)
    const distantResult = scoreCandidate(activeUser, distantCandidate)

    expect(closeResult.score).toBeGreaterThan(distantResult.score)
  })

  it("attributes the full weighted share to each signal when it is individually maxed", () => {
    const activeUser = makeActiveUser()

    const interestsMaxed = scoreCandidate(activeUser, makeCandidate({ hobbies: ["hiking", "boardgames"], interests: ["coffee", "music"] }))
    expect(interestsMaxed.breakdown.sharedInterests).toBeCloseTo(MATCH_WEIGHTS.sharedInterests, 5)

    const availabilityMaxed = scoreCandidate(activeUser, makeCandidate(), { availabilityOverlapRatio: 1 })
    expect(availabilityMaxed.breakdown.availabilityOverlap).toBeCloseTo(MATCH_WEIGHTS.availabilityOverlap, 5)

    const travelMaxed = scoreCandidate(activeUser, makeCandidate({ travelKm: 10 }))
    expect(travelMaxed.breakdown.travelPracticality).toBeCloseTo(MATCH_WEIGHTS.travelPracticality, 5)

    const budgetMaxed = scoreCandidate(activeUser, makeCandidate({ budgetAud: 20 }))
    expect(budgetMaxed.breakdown.budgetFit).toBeCloseTo(MATCH_WEIGHTS.budgetFit, 5)

    const socialMaxed = scoreCandidate(activeUser, makeCandidate({ socialEnergy: "moderate" }))
    expect(socialMaxed.breakdown.socialGroupFit).toBeCloseTo(MATCH_WEIGHTS.socialGroupFit, 5)

    const feedbackMaxed = scoreCandidate(activeUser, makeCandidate(), { candidatePriorFeedback: 1 })
    expect(feedbackMaxed.breakdown.previousFeedback).toBeCloseTo(MATCH_WEIGHTS.previousFeedback, 5)

    const reliabilityMaxed = scoreCandidate(activeUser, makeCandidate(), { candidateReliability: 1 })
    expect(reliabilityMaxed.breakdown.privateReliability).toBeCloseTo(MATCH_WEIGHTS.privateReliability, 5)
  })

  it("returns at least two reasons for a strong overall match", () => {
    const activeUser = makeActiveUser()
    const candidate = makeCandidate()

    const result = scoreCandidate(activeUser, candidate, {
      availabilityOverlapRatio: 1,
      candidatePriorFeedback: 1,
      candidateReliability: 1,
    })

    expect(result.reasons.length).toBeGreaterThanOrEqual(2)
  })

  it("never lets the total score exceed 1 or drop below 0", () => {
    const activeUser = makeActiveUser()

    const bestCase = scoreCandidate(
      activeUser,
      makeCandidate({ hobbies: ["hiking", "boardgames"], interests: ["coffee", "music"], travelKm: 10, budgetAud: 20, socialEnergy: "moderate" }),
      { availabilityOverlapRatio: 1, candidatePriorFeedback: 1, candidateReliability: 1 }
    )
    expect(bestCase.score).toBeLessThanOrEqual(1)
    expect(bestCase.score).toBeGreaterThanOrEqual(0)

    const worstCase = scoreCandidate(
      activeUser,
      makeCandidate({
        hobbies: ["pottery"],
        interests: ["skydiving"],
        travelKm: 5,
        budgetAud: 500,
        socialEnergy: "high",
        areaLat: 40.7128,
        areaLng: -74.006,
      }),
      { availabilityOverlapRatio: 0, candidatePriorFeedback: 0, candidateReliability: 0 }
    )
    expect(worstCase.score).toBeLessThanOrEqual(1)
    expect(worstCase.score).toBeGreaterThanOrEqual(0)
  })
})

describe("explorationFactor", () => {
  it("returns the initial 90/10 policy for a first meetup", () => {
    expect(explorationFactor(0)).toEqual(EXPLORATION_POLICY.initial)
  })

  it("returns the 70/30 policy after three completed meetups", () => {
    expect(explorationFactor(3)).toEqual(EXPLORATION_POLICY.afterThreeMeetups)
  })
})
