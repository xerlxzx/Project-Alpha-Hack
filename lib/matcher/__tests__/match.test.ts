import { describe, expect, it } from "vitest"
import type { AvailabilityWindow, Preferences, Profile } from "@/lib/types"
import { buildMatch, describeGenderMix } from "@/lib/matcher/match"
import {
  accessibilityCompatible,
  activitySignalsAllowed,
  deriveCandidateGateFlags,
} from "@/lib/matcher/loadPool"

type ActiveUser = Parameters<typeof buildMatch>[0]
type PoolMember = Parameters<typeof buildMatch>[1][number]

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

function makePreferences(userId: string, overrides: Partial<Preferences> = {}): Preferences {
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
    areaLat: -33.888,
    areaLng: 151.187,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
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

function makeActiveUser(overrides: Partial<Preferences> = {}): ActiveUser {
  return {
    ...makeProfile("active-1"),
    ...makePreferences("active-1", overrides),
    id: "active-1",
    verified: true,
    ageOk: true,
    completedMeetups: 0,
    availability: [makeWindow("active-1", "2026-08-29T18:00:00Z", "2026-08-29T20:00:00Z")],
  }
}

function makePoolMember(userId: string, overrides: Partial<PoolMember> = {}): PoolMember {
  return {
    ...makeProfile(userId),
    ...makePreferences(userId),
    id: userId,
    verified: true,
    ageOk: true,
    safetyProhibited: false,
    accessibilityMet: true,
    activityAllowed: true,
    availability: [makeWindow(userId, "2026-08-29T18:30:00Z", "2026-08-29T19:30:00Z")],
    priorFeedback: 0.8,
    reliability: 0.8,
    ...overrides,
  }
}

function makeCtx(overrides: Partial<Parameters<typeof buildMatch>[2]> = {}): Parameters<typeof buildMatch>[2] {
  return {
    blockedPairs: [],
    now: new Date("2026-08-29T12:00:00Z"),
    ...overrides,
  }
}

describe("buildMatch", () => {
  it("runs gates before scoring, so a gate-failing candidate never appears even if it would score highest", () => {
    const activeUser = makeActiveUser()
    const perfectButUnverified = makePoolMember("cand-perfect", {
      verified: false,
      hobbies: ["hiking", "boardgames"],
      interests: ["coffee", "music"],
    })
    const pool = [
      perfectButUnverified,
      makePoolMember("cand-2"),
      makePoolMember("cand-3"),
      makePoolMember("cand-4"),
    ]

    const result = buildMatch(activeUser, pool, makeCtx())

    expect(result.members.some((m) => m.userId === "cand-perfect")).toBe(false)
  })

  it("returns a group sized 3-6 ranked by score desc, targeting 4 when enough qualify", () => {
    const activeUser = makeActiveUser()
    const pool = [
      makePoolMember("cand-1", { hobbies: ["hiking", "boardgames"], interests: ["coffee", "music"] }),
      makePoolMember("cand-2", { hobbies: ["hiking"], interests: ["coffee"] }),
      makePoolMember("cand-3", { hobbies: ["pottery"], interests: ["skydiving"] }),
      makePoolMember("cand-4", { hobbies: ["boardgames"], interests: ["music"] }),
      makePoolMember("cand-5", { hobbies: [], interests: [] }),
    ]

    const result = buildMatch(activeUser, pool, makeCtx())

    expect(result.status).toBe("ready")
    expect(result.members.length).toBeGreaterThanOrEqual(3)
    expect(result.members.length).toBeLessThanOrEqual(6)
    expect(result.members.length).toBe(4)
    for (let i = 1; i < result.members.length; i++) {
      expect(result.members[i - 1].score).toBeGreaterThanOrEqual(result.members[i].score)
    }
  })

  it("returns status insufficient with no fabricated group when fewer than three candidates pass the gates", () => {
    const activeUser = makeActiveUser()
    const pool = [
      makePoolMember("cand-1", { verified: false }),
      makePoolMember("cand-2", { safetyProhibited: true }),
      makePoolMember("cand-3"),
    ]

    const result = buildMatch(activeUser, pool, makeCtx())

    expect(result.status).toBe("insufficient")
    expect(result.members).toEqual([])
  })

  it("gives at least two group-level explanation reasons for a healthy group", () => {
    const activeUser = makeActiveUser()
    const pool = [
      makePoolMember("cand-1", { hobbies: ["hiking", "boardgames"], interests: ["coffee", "music"] }),
      makePoolMember("cand-2", { hobbies: ["hiking", "boardgames"], interests: ["coffee", "music"] }),
      makePoolMember("cand-3", { hobbies: ["hiking", "boardgames"], interests: ["coffee", "music"] }),
      makePoolMember("cand-4", { hobbies: ["hiking", "boardgames"], interests: ["coffee", "music"] }),
    ]

    const result = buildMatch(activeUser, pool, makeCtx())

    expect(result.status).toBe("ready")
    expect(result.explanation.length).toBeGreaterThanOrEqual(2)
  })

  it("fails the accessibility gate when an active need is not shared by a candidate", () => {
    const activeUser = makeActiveUser({ accessibility: "wheelchair access" })
    const pool = [
      makePoolMember("cand-1", { accessibility: null, accessibilityMet: false }),
      makePoolMember("cand-2", { accessibility: "wheelchair access", accessibilityMet: true }),
      makePoolMember("cand-3", { accessibility: "wheelchair access", accessibilityMet: true }),
      makePoolMember("cand-4", { accessibility: "wheelchair access", accessibilityMet: true }),
    ]

    const result = buildMatch(activeUser, pool, makeCtx())

    expect(result.members.some((member) => member.userId === "cand-1")).toBe(false)
  })
})

describe("describeGenderMix", () => {
  it("returns deterministic aggregate counts without identity fields", () => {
    expect(describeGenderMix(["woman", "man", "woman", "non-binary"])).toBe(
      "2 women, 1 man, 1 non-binary"
    )
  })

  it("reports undisclosed genders as an aggregate", () => {
    expect(describeGenderMix(["woman", null, undefined])).toBe("1 woman, 2 undisclosed")
  })
})

describe("pool gate signal derivation", () => {
  it("fails closed when a candidate does not share the active accessibility need", () => {
    expect(accessibilityCompatible("wheelchair access needed", null)).toBe(false)
    expect(accessibilityCompatible("Wheelchair access needed", " wheelchair access needed ")).toBe(true)
    expect(accessibilityCompatible(null, "wheelchair access needed")).toBe(false)
    expect(accessibilityCompatible(null, null)).toBe(true)
  })

  it("evaluates only the proposed activity, never candidate hobbies", () => {
    const activePreferences = makePreferences("active-1")
    const candidateWithExcludedHobby = makePreferences("cand-1", {
      hobbies: ["wine tasting"],
    })

    expect(deriveCandidateGateFlags(activePreferences, candidateWithExcludedHobby, null).activityAllowed).toBe(true)
    expect(
      deriveCandidateGateFlags(activePreferences, candidateWithExcludedHobby, "basketball").activityAllowed
    ).toBe(true)
    expect(
      deriveCandidateGateFlags(activePreferences, candidateWithExcludedHobby, "wine tasting").activityAllowed
    ).toBe(false)
  })

  it("keeps proposed-activity policy deterministic", () => {
    expect(activitySignalsAllowed([])).toBe(true)
    expect(activitySignalsAllowed(["wine tasting", "food exploration"])).toBe(false)
    expect(activitySignalsAllowed(["basketball", "food exploration"])).toBe(true)
  })
})

describe("buildMatch targetSize", () => {
  function makeFullPool(): PoolMember[] {
    return [
      makePoolMember("cand-1"),
      makePoolMember("cand-2"),
      makePoolMember("cand-3"),
      makePoolMember("cand-4"),
      makePoolMember("cand-5"),
      makePoolMember("cand-6"),
    ]
  }

  it("honors a targetSize within [GROUP_MIN, GROUP_MAX]", () => {
    const result = buildMatch(makeActiveUser(), makeFullPool(), makeCtx({ targetSize: 5 }))
    expect(result.status).toBe("ready")
    expect(result.members.length).toBe(5)
  })

  it("clamps a targetSize below GROUP_MIN up to GROUP_MIN", () => {
    const result = buildMatch(makeActiveUser(), makeFullPool(), makeCtx({ targetSize: 1 }))
    expect(result.status).toBe("ready")
    expect(result.members.length).toBe(3)
  })

  it("clamps a targetSize above GROUP_MAX down to GROUP_MAX", () => {
    const result = buildMatch(makeActiveUser(), makeFullPool(), makeCtx({ targetSize: 10 }))
    expect(result.status).toBe("ready")
    expect(result.members.length).toBe(6)
  })

  it("still caps to the pool size when targetSize exceeds available eligible candidates", () => {
    const smallPool = [makePoolMember("cand-1"), makePoolMember("cand-2"), makePoolMember("cand-3")]
    const result = buildMatch(makeActiveUser(), smallPool, makeCtx({ targetSize: 6 }))
    expect(result.status).toBe("ready")
    expect(result.members.length).toBe(3)
  })

  it("defaults to GROUP_TARGET (4) when targetSize is not provided", () => {
    const result = buildMatch(makeActiveUser(), makeFullPool(), makeCtx())
    expect(result.status).toBe("ready")
    expect(result.members.length).toBe(4)
  })
})
