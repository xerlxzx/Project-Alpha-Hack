import { describe, expect, it, vi } from "vitest"
import { runVenueAgent, type AgentDeps, type GroupProfile } from "@/lib/venue-agent/agent"
import { FALLBACK_RECOMMENDATION } from "@/lib/venue-agent/fallback"
import type { PlaceCandidate } from "@/lib/venue-agent/places"

const group: GroupProfile = {
  interests: ["basketball", "food"],
  center: { lat: -33.8886, lng: 151.1873 }, // Camperdown
  budgetAud: 20,
  travelKm: 5,
  groupSize: 4,
}

const plan = { textQuery: "basketball courts near Camperdown", keywords: ["basketball"], radiusM: 5000 }

function makeCandidate(overrides: Partial<PlaceCandidate> = {}): PlaceCandidate {
  return {
    placeId: "real-place-1",
    name: "Real Sports Centre",
    address: "1 Real St, Camperdown NSW",
    location: { lat: -33.89, lng: 151.19 },
    openNow: true,
    priceLevel: "PRICE_LEVEL_INEXPENSIVE",
    website: "https://real-sports.example",
    mapsUrl: "https://maps.google.com/?cid=real-place-1",
    accessibility: null,
    ...overrides,
  }
}

const candidates = [makeCandidate()]

function makeDeps(overrides: Partial<AgentDeps> = {}): AgentDeps {
  return {
    planSearch: vi.fn().mockResolvedValue(plan),
    searchPlaces: vi.fn().mockResolvedValue(candidates),
    getPlaceDetails: vi.fn().mockResolvedValue(candidates[0]),
    rankCandidates: vi.fn().mockResolvedValue({
      placeId: "real-place-1",
      activityTitle: "Casual basketball",
      reason: "Fits the group's shared interest in basketball.",
      confidence: 0.8,
    }),
    ...overrides,
  }
}

describe("runVenueAgent", () => {
  it("rejects a ranked placeId not among the returned candidates and falls back", async () => {
    const deps = makeDeps({
      rankCandidates: vi.fn().mockResolvedValue({
        placeId: "invented-place-not-in-results",
        activityTitle: "Casual basketball",
        reason: "Invented reason.",
        confidence: 0.8,
      }),
    })

    const result = await runVenueAgent(group, deps)

    expect(result.source).toBe("fallback")
    expect(result.recommendation.placeId).not.toBe("invented-place-not-in-results")
    expect(result.recommendation.placeId).toBe(FALLBACK_RECOMMENDATION.placeId)
  })

  it("flags overBudgetPreference when estimated cost is $5-$10 over budget but still returns it", async () => {
    const overBudgetCandidate = makeCandidate({ priceLevel: "PRICE_LEVEL_MODERATE" })
    const deps = makeDeps({
      searchPlaces: vi.fn().mockResolvedValue([overBudgetCandidate]),
      getPlaceDetails: vi.fn().mockResolvedValue(overBudgetCandidate),
    })

    // group.budgetAud = 20; PRICE_LEVEL_MODERATE maps to 35 AUD (>$10 over,
    // but still exercises the "still returned" behavior for an over-budget pick).
    const result = await runVenueAgent(group, deps)

    expect(result.source).toBe("live")
    expect(result.recommendation.overBudgetPreference).toBe(true)
    expect(result.recommendation.estimatedCostAud).toBe(35)
  })

  it("flags overDistancePreference when the venue is slightly beyond travelKm", async () => {
    // ~7.8km from group.center, group.travelKm = 5.
    const farCandidate = makeCandidate({ location: { lat: -33.95, lng: 151.19 } })
    const deps = makeDeps({
      searchPlaces: vi.fn().mockResolvedValue([farCandidate]),
      getPlaceDetails: vi.fn().mockResolvedValue(farCandidate),
    })

    const result = await runVenueAgent(group, deps)

    expect(result.source).toBe("live")
    expect(result.recommendation.overDistancePreference).toBe(true)
  })

  it("falls back to the cached recommendation after two consecutive failures", async () => {
    const deps = makeDeps({
      searchPlaces: vi.fn().mockRejectedValue(new Error("Places API down")),
    })

    const result = await runVenueAgent(group, deps)

    expect(result.source).toBe("fallback")
    expect(result.recommendation).toEqual(FALLBACK_RECOMMENDATION)
    expect(deps.searchPlaces).toHaveBeenCalledTimes(2)
  })

  it("takes factual fields from the Places detail, not from the model", async () => {
    const detail = makeCandidate({
      placeId: "real-place-1",
      name: "Real Sports Centre",
      website: "https://real-sports.example",
      mapsUrl: "https://maps.google.com/?cid=real-place-1",
    })
    const deps = makeDeps({
      searchPlaces: vi.fn().mockResolvedValue([detail]),
      getPlaceDetails: vi.fn().mockResolvedValue(detail),
      rankCandidates: vi.fn().mockResolvedValue({
        placeId: "real-place-1",
        // A hallucinating model might try to smuggle in fabricated facts;
        // the agent must ignore anything outside the rank-result schema.
        venueName: "Totally Made Up Venue",
        activityTitle: "Casual basketball",
        reason: "Fits the group's shared interest in basketball.",
        confidence: 0.8,
      }),
    })

    const result = await runVenueAgent(group, deps)

    expect(result.source).toBe("live")
    expect(result.recommendation.venueName).toBe("Real Sports Centre")
    expect(result.recommendation.placeId).toBe("real-place-1")
    expect(result.recommendation.bookingUrl).toBe("https://real-sports.example")
  })
})
