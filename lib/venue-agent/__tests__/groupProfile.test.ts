import { describe, expect, it } from "vitest"
import { buildGroupProfileFromMembers, type MemberProfileInput } from "@/lib/venue-agent/groupProfile"

function makeMember(overrides: Partial<MemberProfileInput> = {}): MemberProfileInput {
  return {
    interests: ["coffee"],
    hobbies: ["hiking"],
    budgetAud: 20,
    travelKm: 10,
    areaLat: -33.888,
    areaLng: 151.187,
    accessibility: null,
    ...overrides,
  }
}

describe("buildGroupProfileFromMembers", () => {
  it("unions interests and hobbies across members, deduplicated", () => {
    const members = [
      makeMember({ interests: ["coffee"], hobbies: ["hiking"] }),
      makeMember({ interests: ["coffee", "music"], hobbies: ["boardgames"] }),
    ]
    const result = buildGroupProfileFromMembers(members, {
      fallbackCenter: { lat: 0, lng: 0 },
      groupSize: 2,
    })
    expect(result.interests.sort()).toEqual(["boardgames", "coffee", "hiking", "music"].sort())
  })

  it("takes the minimum (most restrictive) budget and travel across members", () => {
    const members = [makeMember({ budgetAud: 30, travelKm: 15 }), makeMember({ budgetAud: 10, travelKm: 5 })]
    const result = buildGroupProfileFromMembers(members, { fallbackCenter: { lat: 0, lng: 0 }, groupSize: 2 })
    expect(result.budgetAud).toBe(10)
    expect(result.travelKm).toBe(5)
  })

  it("falls back to defaults when no member has a budget/travel preference set", () => {
    const members = [makeMember({ budgetAud: null, travelKm: null })]
    const result = buildGroupProfileFromMembers(members, { fallbackCenter: { lat: 0, lng: 0 }, groupSize: 1 })
    expect(result.budgetAud).toBe(20)
    expect(result.travelKm).toBe(10)
  })

  it("averages member coordinates for the center when locations are present", () => {
    const members = [
      makeMember({ areaLat: -33.0, areaLng: 151.0 }),
      makeMember({ areaLat: -34.0, areaLng: 152.0 }),
    ]
    const result = buildGroupProfileFromMembers(members, { fallbackCenter: { lat: 0, lng: 0 }, groupSize: 2 })
    expect(result.center).toEqual({ lat: -33.5, lng: 151.5 })
  })

  it("uses the fallback center when no member has a location", () => {
    const members = [makeMember({ areaLat: null, areaLng: null })]
    const result = buildGroupProfileFromMembers(members, { fallbackCenter: { lat: -33.8886, lng: 151.1873 }, groupSize: 1 })
    expect(result.center).toEqual({ lat: -33.8886, lng: 151.1873 })
  })

  it("collects distinct non-null accessibility needs, omitting the field when there are none", () => {
    const members = [makeMember({ accessibility: "wheelchair access" }), makeMember({ accessibility: null })]
    const result = buildGroupProfileFromMembers(members, { fallbackCenter: { lat: 0, lng: 0 }, groupSize: 2 })
    expect(result.accessibilityNeeds).toEqual(["wheelchair access"])

    const noNeeds = buildGroupProfileFromMembers([makeMember({ accessibility: null })], {
      fallbackCenter: { lat: 0, lng: 0 },
      groupSize: 1,
    })
    expect(noNeeds.accessibilityNeeds).toBeUndefined()
  })

  it("uses groupSize from options, not members.length, and passes through allowedCategories", () => {
    const result = buildGroupProfileFromMembers([makeMember()], {
      fallbackCenter: { lat: 0, lng: 0 },
      groupSize: 4,
      allowedCategories: ["study"],
    })
    expect(result.groupSize).toBe(4)
    expect(result.allowedCategories).toEqual(["study"])
  })
})
