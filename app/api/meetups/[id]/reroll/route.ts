import { GoogleGenAI } from "@google/genai"
import { NextResponse } from "next/server"
import { z } from "zod"
import { GEMINI_MODEL, getEnv } from "@/lib/config"
import { assertMeetupMember, getCurrentUser } from "@/lib/current-user"
import { allowAiRequest } from "@/lib/rate-limit"
import { getAdminSupabase } from "@/lib/supabase/server"
import { runVenueAgent, type AgentDeps, type GroupProfile } from "@/lib/venue-agent/agent"
import { placeDetails, placesTextSearch, type PlaceCandidate } from "@/lib/venue-agent/places"
import { SearchPlanSchema, type SearchPlan } from "@/lib/venue-agent/schema"
import { buildGroupProfileForMeetup } from "@/app/api/venue-agent/route"

// What Gemini may contribute when re-ranking for a reroll: a pick from the
// filtered candidates plus an explanation. Places supplies venue facts.
const RerollRankResultSchema = z.object({
  placeId: z.string(),
  activityTitle: z.string(),
  reason: z.string(),
  confidence: z.number().min(0).max(1),
})

// Reuse the group's constraints for rerolls. The group's
// constraints haven't changed since the original recommendation, so the
// search plan is derived directly from the profile. Exclusion of the prior
// venue happens in searchPlaces below, not here.
function buildRerollSearchPlan(group: GroupProfile): SearchPlan {
  const textQuery = group.interests.length > 0 ? `${group.interests.slice(0, 3).join(" ")} venue` : "activity venue"
  return SearchPlanSchema.parse({
    textQuery,
    keywords: group.interests,
    radiusM: Math.max(group.travelKm, 1) * 1000,
  })
}

function buildRerollRankPrompt(candidates: PlaceCandidate[], group: GroupProfile): string {
  const summaries = candidates.map((candidate) => ({
    placeId: candidate.placeId,
    name: candidate.name,
    address: candidate.address,
    openNow: candidate.openNow,
    priceLevel: candidate.priceLevel,
  }))

  return [
    "The group used their one reroll. They want a DIFFERENT venue than last time.",
    "The candidate list below has already had the previous recommendation removed, so just pick the best remaining fit.",
    `Group interests: ${JSON.stringify(group.interests)}`,
    `Candidates: ${JSON.stringify(summaries)}`,
    "Return ONLY JSON matching the given schema: the placeId of your pick (must be one of the candidates' placeId values), an activityTitle, a reason tying the pick to the group's shared interests, and a confidence between 0 and 1.",
  ].join("\n")
}

// Builds venue-agent deps for a reroll: the same Places-backed search/details
// calls as the default agent, but with the prior recommendation's placeId
// filtered out before Gemini ranks candidates, preventing a repeat pick.
// agent.ts keeps its default deps builder private, so rerolls define their own.
function buildRerollDeps(excludePlaceId: string): AgentDeps {
  const ai = new GoogleGenAI({ apiKey: getEnv("GEMINI_API_KEY") })

  return {
    planSearch: async (group) => buildRerollSearchPlan(group),
    searchPlaces: async (plan, group) => {
      const candidates = await placesTextSearch(plan.textQuery, {
        lat: group.center.lat,
        lng: group.center.lng,
        radiusM: plan.radiusM,
      })
      return candidates.filter((candidate) => candidate.placeId !== excludePlaceId)
    },
    getPlaceDetails: (placeId) => placeDetails(placeId),
    rankCandidates: async (candidates, group) => {
      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: buildRerollRankPrompt(candidates, group),
        config: {
          responseMimeType: "application/json",
          responseSchema: z.toJSONSchema(RerollRankResultSchema),
        },
      })
      const text = response.text
      if (!text) {
        throw new Error("Gemini returned no reroll ranking")
      }
      return JSON.parse(text)
    },
  }
}

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: meetupId } = await params

  // Authz gate: the caller must be a real member of this meetup. Resolved
  // from the session (never from client-supplied input) and checked before
  // any Gemini/Places work runs.
  const currentUser = await getCurrentUser()
  if (!currentUser) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }
  const userId = currentUser.id
  if (!(await assertMeetupMember(userId, meetupId))) {
    return NextResponse.json({ error: "not_a_member" }, { status: 403 })
  }

  const supabase = getAdminSupabase()

  const { data: member, error: memberError } = await supabase
    .from("meetup_members")
    .select("id, reroll_used")
    .eq("meetup_id", meetupId)
    .eq("user_id", userId)
    .maybeSingle()

  if (memberError) {
    return NextResponse.json({ error: "lookup_failed", detail: memberError.message }, { status: 500 })
  }
  if (!member) {
    return NextResponse.json({ error: "not_a_member" }, { status: 403 })
  }
  // One reroll per member. Checked before any agent work runs.
  if (member.reroll_used) {
    return NextResponse.json({ error: "reroll_already_used" }, { status: 409 })
  }

  if (!(await allowAiRequest())) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 })
  }

  const { data: priorRecommendation, error: priorError } = await supabase
    .from("activity_recommendations")
    .select("place_id")
    .eq("meetup_id", meetupId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (priorError) {
    return NextResponse.json({ error: "lookup_failed", detail: priorError.message }, { status: 500 })
  }

  let group: GroupProfile
  try {
    group = await buildGroupProfileForMeetup(meetupId)
  } catch (err) {
    return NextResponse.json(
      { error: "meetup_not_found", detail: err instanceof Error ? err.message : String(err) },
      { status: 404 }
    )
  }

  const deps = priorRecommendation?.place_id ? buildRerollDeps(priorRecommendation.place_id) : undefined
  const result = await runVenueAgent(group, deps)

  let rawPlacesJson: unknown = null
  if (result.source === "live") {
    try {
      rawPlacesJson = await placeDetails(result.recommendation.placeId)
    } catch {
      rawPlacesJson = null
    }
  }

  const { error: insertError } = await supabase.from("activity_recommendations").insert({
    meetup_id: meetupId,
    place_id: result.recommendation.placeId,
    venue_name: result.recommendation.venueName,
    activity_title: result.recommendation.activityTitle,
    reason: result.recommendation.reason,
    est_cost_aud: result.recommendation.estimatedCostAud,
    est_distance_km: result.recommendation.estimatedDistanceKm,
    over_budget_pref: result.recommendation.overBudgetPreference,
    over_distance_pref: result.recommendation.overDistancePreference,
    booking_url: result.recommendation.bookingUrl,
    source: result.source,
    raw_places_json: rawPlacesJson,
  })

  if (insertError) {
    return NextResponse.json({ error: "persist_failed", detail: insertError.message }, { status: 500 })
  }

  const { error: updateError } = await supabase
    .from("meetup_members")
    .update({ reroll_used: true })
    .eq("id", member.id)

  if (updateError) {
    return NextResponse.json({ error: "reroll_flag_failed", detail: updateError.message }, { status: 500 })
  }

  return NextResponse.json({
    recommendation: result.recommendation,
    steps: result.steps,
    source: result.source,
  })
}
