import { describe, expect, it } from "vitest"
import { RecommendationSchema, SearchPlanSchema } from "@/lib/venue-agent/schema"

function makeRecommendation(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    activityTitle: "Casual basketball and dumplings",
    placeId: "google-place-id",
    venueName: "Example Sports Centre",
    reason: "Four members selected basketball and the venue fits the shared time window.",
    estimatedCostAud: 12,
    estimatedDistanceKm: 3.4,
    overBudgetPreference: false,
    overDistancePreference: false,
    bookingRequired: true,
    bookingUrl: "https://venue.example/booking",
    confidence: 0.91,
    ...overrides,
  }
}

function makeSearchPlan(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    textQuery: "basketball courts near campus",
    keywords: ["basketball", "sports centre"],
    radiusM: 5000,
    ...overrides,
  }
}

describe("RecommendationSchema", () => {
  it("parses a valid §17 recommendation object", () => {
    expect(() => RecommendationSchema.parse(makeRecommendation())).not.toThrow()
  })

  it("fails when placeId is missing", () => {
    const result = RecommendationSchema.safeParse(makeRecommendation({ placeId: undefined }))
    expect(result.success).toBe(false)
  })

  it("fails when estimatedCostAud has the wrong type", () => {
    const result = RecommendationSchema.safeParse(
      makeRecommendation({ estimatedCostAud: "12" })
    )
    expect(result.success).toBe(false)
  })

  it("accepts null when Places has no factual AUD cost", () => {
    const result = RecommendationSchema.safeParse(
      makeRecommendation({ estimatedCostAud: null })
    )
    expect(result.success).toBe(true)
  })

  it("fails when confidence is outside 0..1", () => {
    const result = RecommendationSchema.safeParse(makeRecommendation({ confidence: 1.5 }))
    expect(result.success).toBe(false)
  })

  it("allows bookingUrl to be null", () => {
    const result = RecommendationSchema.safeParse(makeRecommendation({ bookingUrl: null }))
    expect(result.success).toBe(true)
  })
})

describe("SearchPlanSchema", () => {
  it("parses a valid search plan", () => {
    expect(() => SearchPlanSchema.parse(makeSearchPlan())).not.toThrow()
  })

  it("fails when textQuery is missing", () => {
    const result = SearchPlanSchema.safeParse(makeSearchPlan({ textQuery: undefined }))
    expect(result.success).toBe(false)
  })
})
