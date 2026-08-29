import { NextResponse } from "next/server"
import { z } from "zod"
import { assertMeetupMember, getCurrentUser } from "@/lib/current-user"
import { getAdminSupabase } from "@/lib/supabase/server"
import { placeDetails } from "@/lib/venue-agent/places"
import { runVenueAgent, type GroupProfile } from "@/lib/venue-agent/agent"

const RequestBodySchema = z.object({ meetupId: z.string() })

// PRD §9.8 fallbacks for when a member hasn't set a preference at all.
const DEFAULT_BUDGET_AUD = 20
const DEFAULT_TRAVEL_KM = 10

interface PreferenceRow {
  travel_km: number | null
  budget_aud: number | null
  hobbies: string[] | null
  interests: string[] | null
  accessibility: string | null
  area_lat: number | null
  area_lng: number | null
}

// Builds the venue agent's GroupProfile from a meetup's real members (PRD
// §9.8 inputs). Exported so the reroll route (Task 3.4's other file) can
// reuse it instead of duplicating the aggregation — both files are owned by
// this task.
export async function buildGroupProfileForMeetup(meetupId: string): Promise<GroupProfile> {
  const supabase = getAdminSupabase()

  const { data: meetup, error: meetupError } = await supabase
    .from("meetups")
    .select("area_lat, area_lng, tags")
    .eq("id", meetupId)
    .maybeSingle()

  if (meetupError) {
    throw new Error(`Failed to load meetup ${meetupId}: ${meetupError.message}`)
  }
  if (!meetup) {
    throw new Error(`Meetup not found: ${meetupId}`)
  }

  const { data: members, error: membersError } = await supabase
    .from("meetup_members")
    .select("user_id")
    .eq("meetup_id", meetupId)

  if (membersError) {
    throw new Error(`Failed to load members for meetup ${meetupId}: ${membersError.message}`)
  }
  if (!members || members.length === 0) {
    throw new Error(`Meetup ${meetupId} has no members`)
  }

  const userIds = members.map((member) => member.user_id as string)

  const { data: preferences, error: prefsError } = await supabase
    .from("preferences")
    .select("travel_km, budget_aud, hobbies, interests, accessibility, area_lat, area_lng")
    .in("user_id", userIds)

  if (prefsError) {
    throw new Error(`Failed to load preferences for meetup ${meetupId}: ${prefsError.message}`)
  }

  const prefRows = (preferences ?? []) as PreferenceRow[]

  // PRD §9.8: "Aggregated group interests" — same union-of-interests-and-hobbies
  // convention as lib/matcher/score.ts's scoreSharedInterests.
  const interests = Array.from(
    new Set(prefRows.flatMap((row) => [...(row.interests ?? []), ...(row.hobbies ?? [])]))
  )

  const accessibilityNeeds = Array.from(
    new Set(prefRows.map((row) => row.accessibility).filter((value): value is string => Boolean(value)))
  )

  const travelValues = prefRows
    .map((row) => row.travel_km)
    .filter((value): value is number => value != null)
  const budgetValues = prefRows
    .map((row) => row.budget_aud)
    .filter((value): value is number => value != null)

  // Most-restrictive-member-wins, matching lib/matcher/score.ts's
  // closenessRadius(a, b) = min(a, b) convention for travel tolerance — the
  // group's shared budget/travel ceiling is set by whoever can afford/travel
  // the least, not the average.
  const budgetAud = budgetValues.length > 0 ? Math.min(...budgetValues) : DEFAULT_BUDGET_AUD
  const travelKm = travelValues.length > 0 ? Math.min(...travelValues) : DEFAULT_TRAVEL_KM

  const locatedRows = prefRows.filter(
    (row): row is PreferenceRow & { area_lat: number; area_lng: number } =>
      row.area_lat != null && row.area_lng != null
  )
  const center =
    locatedRows.length > 0
      ? {
          lat: locatedRows.reduce((sum, row) => sum + row.area_lat, 0) / locatedRows.length,
          lng: locatedRows.reduce((sum, row) => sum + row.area_lng, 0) / locatedRows.length,
        }
      : { lat: meetup.area_lat ?? 0, lng: meetup.area_lng ?? 0 }

  return {
    interests,
    center,
    budgetAud,
    travelKm,
    groupSize: userIds.length,
    accessibilityNeeds: accessibilityNeeds.length > 0 ? accessibilityNeeds : undefined,
    allowedCategories: meetup.tags ?? undefined,
  }
}

export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 })
  }

  const parsed = RequestBodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request", detail: parsed.error.flatten() }, { status: 400 })
  }

  const { meetupId } = parsed.data

  // Authz gate: the caller must be a member of this meetup. Resolved from
  // the session (never from client-supplied input) — otherwise anyone could
  // trigger Gemini/Places spend and write recommendations into any meetup.
  const currentUser = await getCurrentUser()
  if (!currentUser) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }
  if (!(await assertMeetupMember(currentUser.id, meetupId))) {
    return NextResponse.json({ error: "not_a_member" }, { status: 403 })
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

  const result = await runVenueAgent(group)

  // Places is the only source of venue facts (global constraint) — re-fetch
  // the winning place's detail purely to persist as the raw_places_json
  // provenance record. The fallback recommendation has no real Places
  // placeId, so there is nothing genuine to store for it.
  let rawPlacesJson: unknown = null
  if (result.source === "live") {
    try {
      rawPlacesJson = await placeDetails(result.recommendation.placeId)
    } catch {
      rawPlacesJson = null
    }
  }

  const adminSupabase = getAdminSupabase()
  const { error: insertError } = await adminSupabase.from("activity_recommendations").insert({
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

  return NextResponse.json({
    recommendation: result.recommendation,
    steps: result.steps,
    source: result.source,
  })
}
