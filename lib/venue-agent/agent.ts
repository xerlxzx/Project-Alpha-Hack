import { GoogleGenAI } from "@google/genai"
import { z } from "zod"
import { GEMINI_MODEL, getEnv } from "@/lib/config"
import { FALLBACK_RECOMMENDATION } from "@/lib/venue-agent/fallback"
import {
  isClosedBusinessStatus,
  placeDetails,
  placesTextSearch,
  type PlaceCandidate,
  type PlaceDetail,
} from "@/lib/venue-agent/places"
import { RecommendationSchema, SearchPlanSchema, type Recommendation, type SearchPlan } from "@/lib/venue-agent/schema"

export interface AgentStep {
  key: string
  label: string
  status: "pending" | "active" | "done"
  detail?: string
}

export interface GroupProfile {
  interests: string[]
  center: { lat: number; lng: number }
  budgetAud: number
  travelKm: number
  groupSize: number
  accessibilityNeeds?: string[]
  allowedCategories?: string[]
}

export interface RunVenueAgentResult {
  recommendation: Recommendation
  steps: AgentStep[]
  source: "live" | "fallback"
}

// Gemini may pick a supplied placeId and explain it. Places supplies all
// venue facts.
const RankResultSchema = z.object({
  placeId: z.string(),
  activityTitle: z.string(),
  reason: z.string(),
  confidence: z.number().min(0).max(1),
})
type RankResult = z.infer<typeof RankResultSchema>

export interface AgentDeps {
  planSearch: (group: GroupProfile) => Promise<unknown>
  searchPlaces: (plan: SearchPlan, group: GroupProfile) => Promise<PlaceCandidate[]>
  getPlaceDetails: (placeId: string) => Promise<PlaceDetail>
  rankCandidates: (candidates: PlaceCandidate[], group: GroupProfile, plan: SearchPlan) => Promise<unknown>
}

class VenueAgentError extends Error {}

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const EARTH_RADIUS_KM = 6371
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLng = ((b.lng - a.lng) * Math.PI) / 180
  const lat1 = (a.lat * Math.PI) / 180
  const lat2 = (b.lat * Math.PI) / 180
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return EARTH_RADIUS_KM * 2 * Math.asin(Math.sqrt(h))
}

// Recommendation facts come from Places details or Gemini's validated rank.
function buildRecommendation(detail: PlaceDetail, rank: RankResult, group: GroupProfile): Recommendation {
  const estimatedDistanceKm = haversineKm(group.center, detail.location)
  // Places priceLevel is ordinal, not an AUD amount. No factual AUD source
  // means the cost must remain unknown rather than being converted.
  const estimatedCostAud = null
  const bookingUrl = detail.website ?? detail.mapsUrl ?? null

  return RecommendationSchema.parse({
    activityTitle: rank.activityTitle,
    placeId: detail.placeId,
    venueName: detail.name,
    reason: rank.reason,
    estimatedCostAud,
    estimatedDistanceKm,
    overBudgetPreference: estimatedCostAud !== null && estimatedCostAud > group.budgetAud,
    overDistancePreference: estimatedDistanceKm > group.travelKm,
    // Places does not prove that a website is a booking flow.
    bookingRequired: false,
    bookingUrl,
    confidence: rank.confidence,
  })
}

async function attemptLive(group: GroupProfile, deps: AgentDeps): Promise<{ recommendation: Recommendation; steps: AgentStep[] }> {
  const steps: AgentStep[] = []

  const rawPlan = await deps.planSearch(group)
  const plan = SearchPlanSchema.parse(rawPlan)
  steps.push({ key: "plan", label: "Analyzing group interests", status: "done", detail: plan.textQuery })

  const candidates = await deps.searchPlaces(plan, group)
  if (candidates.length === 0) {
    throw new VenueAgentError("Places returned no candidates for this search plan")
  }
  const candidateIds = new Set(candidates.map((candidate) => candidate.placeId))
  steps.push({ key: "search", label: "Searching Google Places", status: "done" })
  steps.push({ key: "candidates", label: `Found ${candidates.length} candidates`, status: "done" })

  const rawRank = await deps.rankCandidates(candidates, group, plan)
  const rank = RankResultSchema.parse(rawRank)
  if (!candidateIds.has(rank.placeId)) {
    throw new VenueAgentError("Ranked placeId was not among the candidates Places returned for this request")
  }
  steps.push({ key: "rank", label: "Ranking by fit", status: "done" })

  const detail = await deps.getPlaceDetails(rank.placeId)
  if (!candidateIds.has(detail.placeId)) {
    throw new VenueAgentError("Place detail placeId was not among the candidates Places returned for this request")
  }
  if (isClosedBusinessStatus(detail.businessStatus)) {
    throw new VenueAgentError("Selected Place is temporarily or permanently closed")
  }

  const recommendation = buildRecommendation(detail, rank, group)
  steps.push({ key: "selected", label: `Selected: ${recommendation.venueName}`, status: "done" })

  return { recommendation, steps }
}

function fallbackSteps(): AgentStep[] {
  return [
    { key: "plan", label: "Analyzing group interests", status: "done" },
    { key: "search", label: "Searching Google Places", status: "done" },
    { key: "candidates", label: "Found 0 candidates", status: "done", detail: "Live search failed after one retry" },
    { key: "rank", label: "Ranking by fit", status: "done", detail: "Skipped — using cached fallback" },
    {
      key: "selected",
      label: `Selected: ${FALLBACK_RECOMMENDATION.venueName}`,
      status: "done",
      detail: "Cached fallback (live agent failed twice)",
    },
  ]
}

function buildPlanPrompt(group: GroupProfile): string {
  return [
    "You are planning a Google Places Text Search for a student meetup group.",
    "Return ONLY JSON matching the given schema — no prose.",
    `Group interests: ${JSON.stringify(group.interests)}`,
    `Group size: ${group.groupSize}`,
    `Budget (AUD per person): ${group.budgetAud}`,
    `Max travel distance (km): ${group.travelKm}`,
    group.allowedCategories ? `Allowed activity categories: ${JSON.stringify(group.allowedCategories)}` : "",
    group.accessibilityNeeds ? `Accessibility needs: ${JSON.stringify(group.accessibilityNeeds)}` : "",
    "Set radiusM from the travel distance (km * 1000).",
  ]
    .filter(Boolean)
    .join("\n")
}

function buildRankPrompt(candidates: PlaceCandidate[], group: GroupProfile, plan: SearchPlan): string {
  const candidateSummaries = candidates.map((candidate) => ({
    placeId: candidate.placeId,
    name: candidate.name,
    address: candidate.address,
    openNow: candidate.openNow,
    priceLevel: candidate.priceLevel,
  }))

  return [
    "Rank ONLY the candidates below for this group — do not invent a venue or placeId not listed here.",
    `Group interests: ${JSON.stringify(group.interests)}`,
    `Search intent: ${plan.textQuery}`,
    `Candidates: ${JSON.stringify(candidateSummaries)}`,
    "Return ONLY JSON matching the given schema: the placeId of your pick (must be one of the candidates' placeId values), an activityTitle, a reason tying the pick to the group's shared interests, and a confidence between 0 and 1.",
  ].join("\n")
}

function buildDefaultDeps(): AgentDeps {
  const ai = new GoogleGenAI({ apiKey: getEnv("GEMINI_API_KEY") })

  async function generateJson(prompt: string, schema: z.ZodType): Promise<unknown> {
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: z.toJSONSchema(schema),
      },
    })
    const text = response.text
    if (!text) {
      throw new VenueAgentError("Gemini returned no structured output")
    }
    return JSON.parse(text)
  }

  return {
    planSearch: (group) => generateJson(buildPlanPrompt(group), SearchPlanSchema),
    searchPlaces: (plan, group) =>
      placesTextSearch(plan.textQuery, {
        lat: group.center.lat,
        lng: group.center.lng,
        radiusM: plan.radiusM,
      }),
    getPlaceDetails: (placeId) => placeDetails(placeId),
    rankCandidates: (candidates, group, plan) => generateJson(buildRankPrompt(candidates, group, plan), RankResultSchema),
  }
}

export async function runVenueAgent(group: GroupProfile, deps: AgentDeps = buildDefaultDeps()): Promise<RunVenueAgentResult> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { recommendation, steps } = await attemptLive(group, deps)
      return { recommendation, steps, source: "live" }
    } catch {
      // First failure: retry once. Second failure: fall through to fallback.
    }
  }

  return { recommendation: FALLBACK_RECOMMENDATION, steps: fallbackSteps(), source: "fallback" }
}
