import type { Recommendation } from "@/lib/venue-agent/schema"

// When Places/Gemini fail after one retry, the agent returns this cached
// recommendation. The caller (lib/venue-agent/agent.ts) attaches `source: "fallback"`.
export const FALLBACK_RECOMMENDATION: Recommendation = {
  activityTitle: "Casual basketball at Prince Alfred Park",
  placeId: "cached-fallback-prince-alfred-park",
  venueName: "Prince Alfred Park Pool & Courts (cached fallback)",
  reason:
    "Live venue search was unavailable, so this is a cached fallback pick near Camperdown that has suited basketball meetups before.",
  estimatedCostAud: 10,
  estimatedDistanceKm: 2.5,
  overBudgetPreference: false,
  overDistancePreference: false,
  bookingRequired: false,
  bookingUrl: "https://www.cityofsydney.nsw.gov.au/parks-facilities/prince-alfred-park",
  confidence: 0.4,
}
