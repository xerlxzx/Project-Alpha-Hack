import { afterEach, describe, expect, it, vi } from "vitest"
import { runVenueAgent, type AgentDeps, type GroupProfile } from "@/lib/venue-agent/agent"
import { FALLBACK_RECOMMENDATION } from "@/lib/venue-agent/fallback"
import { placeDetails, placesTextSearch, type PlaceCandidate } from "@/lib/venue-agent/places"

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
    businessStatus: "OPERATIONAL",
    photoUrl: null,
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

  it("returns unknown cost instead of inventing AUD from a Places price level", async () => {
    const candidateWithoutAudPrice = makeCandidate({ priceLevel: "PRICE_LEVEL_MODERATE" })
    const deps = makeDeps({
      searchPlaces: vi.fn().mockResolvedValue([candidateWithoutAudPrice]),
      getPlaceDetails: vi.fn().mockResolvedValue(candidateWithoutAudPrice),
    })

    const result = await runVenueAgent(group, deps)

    expect(result.source).toBe("live")
    expect(result.recommendation.estimatedCostAud).toBeNull()
    expect(result.recommendation.overBudgetPreference).toBe(false)
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

  it.each(["CLOSED_TEMPORARILY", "CLOSED_PERMANENTLY"])(
    "rejects a selected venue whose details report %s",
    async (businessStatus) => {
      const candidate = makeCandidate({
        businessStatus: "OPERATIONAL",
      } as Partial<PlaceCandidate>)
      const closedDetail = makeCandidate({
        businessStatus,
      } as Partial<PlaceCandidate>)
      const deps = makeDeps({
        searchPlaces: vi.fn().mockResolvedValue([candidate]),
        getPlaceDetails: vi.fn().mockResolvedValue(closedDetail),
      })

      const result = await runVenueAgent(group, deps)

      expect(result.source).toBe("fallback")
      expect(deps.getPlaceDetails).toHaveBeenCalledTimes(2)
    }
  )

  it("marks a website handoff as not requiring booking", async () => {
    const result = await runVenueAgent(group, makeDeps())

    expect(result.source).toBe("live")
    expect(result.recommendation.bookingRequired).toBe(false)
    expect(result.recommendation.bookingUrl).toBe("https://real-sports.example")
  })
})

describe("placesTextSearch", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it("filters temporarily and permanently closed businesses from search results", async () => {
    vi.stubEnv("GOOGLE_PLACES_API_KEY", "server-only-test-key")
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            places: [
              {
                id: "open",
                displayName: { text: "Open Venue" },
                location: { latitude: -33.89, longitude: 151.19 },
                businessStatus: "OPERATIONAL",
              },
              {
                id: "temporary",
                displayName: { text: "Temporarily Closed Venue" },
                location: { latitude: -33.89, longitude: 151.19 },
                businessStatus: "CLOSED_TEMPORARILY",
              },
              {
                id: "permanent",
                displayName: { text: "Permanently Closed Venue" },
                location: { latitude: -33.89, longitude: 151.19 },
                businessStatus: "CLOSED_PERMANENTLY",
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      )
    )

    const results = await placesTextSearch("student meetup")

    expect(results.map((result) => result.placeId)).toEqual(["open"])
  })
})

describe("placeDetails", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it("resolves the first Places photo to a key-free media URL", async () => {
    vi.stubEnv("GOOGLE_PLACES_API_KEY", "server-only-test-key")
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "photo-place",
            displayName: { text: "Photographed Venue" },
            location: { latitude: -33.89, longitude: 151.19 },
            businessStatus: "OPERATIONAL",
            photos: [{ name: "places/photo-place/photos/photo-reference" }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            photoUri: "https://lh3.googleusercontent.com/places-photo",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      )
    vi.stubGlobal("fetch", fetchMock)

    const detail = await placeDetails("photo-place")

    expect(detail.photoUrl).toBe("https://lh3.googleusercontent.com/places-photo")
    expect(detail.photoUrl).not.toContain("server-only-test-key")
  })
})
