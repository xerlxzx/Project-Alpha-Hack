import { NextResponse } from "next/server"

import { assertGroupMember, getCurrentUser } from "@/lib/current-user"
import { allowAiRequest } from "@/lib/rate-limit"
import { getAdminSupabase } from "@/lib/supabase/server"
import { FALLBACK_RECOMMENDATION } from "@/lib/venue-agent/fallback"
import { runVenueAgent, type GroupProfile } from "@/lib/venue-agent/agent"
import { placeDetails } from "@/lib/venue-agent/places"
import { buildGroupProfileForMeetup } from "@/app/api/venue-agent/route"

// Organizes a confirmed group's next activity: reuses (or creates) a meetup
// tied to this group and generates its venue recommendation. Members are
// already known to each other from the group's origin meetup, so the new
// meetup skips forming/accept and starts confirmed.

const DAY_MS = 24 * 60 * 60 * 1000

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: groupId } = await params

  const currentUser = await getCurrentUser()
  if (!currentUser) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }
  if (!(await assertGroupMember(currentUser.id, groupId))) {
    return NextResponse.json({ error: "not_a_member" }, { status: 403 })
  }

  const supabase = getAdminSupabase()

  const { data: group, error: groupErr } = await supabase
    .from("groups")
    .select("id, status, origin_meetup_id")
    .eq("id", groupId)
    .maybeSingle()
  if (groupErr) {
    return NextResponse.json({ error: "lookup_failed", detail: groupErr.message }, { status: 500 })
  }
  if (!group || group.status !== "active") {
    return NextResponse.json({ error: "not_found" }, { status: 404 })
  }

  // Idempotent: reuse this group's current (not-yet-completed) meetup rather
  // than spinning up a second one on a repeat tap.
  const { data: existingMeetup, error: existingErr } = await supabase
    .from("meetups")
    .select("id")
    .eq("group_id", groupId)
    .in("status", ["forming", "confirmed"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (existingErr) {
    return NextResponse.json({ error: "lookup_failed", detail: existingErr.message }, { status: 500 })
  }
  if (existingMeetup) {
    return NextResponse.json({ meetupId: existingMeetup.id, created: false })
  }

  const { data: activeMembers, error: membersErr } = await supabase
    .from("group_members")
    .select("user_id")
    .eq("group_id", groupId)
    .eq("status", "active")
  if (membersErr || !activeMembers || activeMembers.length === 0) {
    return NextResponse.json({ error: "member_lookup_failed", detail: membersErr?.message }, { status: 500 })
  }
  const memberIds = activeMembers.map((m) => m.user_id as string)

  const { data: originMeetup } = group.origin_meetup_id
    ? await supabase.from("meetups").select("area_lat, area_lng").eq("id", group.origin_meetup_id).maybeSingle()
    : { data: null }

  const scheduledAt = new Date(Date.now() + 5 * DAY_MS)
  scheduledAt.setHours(18, 0, 0, 0)

  const { data: meetup, error: meetupErr } = await supabase
    .from("meetups")
    .insert({
      status: "confirmed",
      quorum: memberIds.length,
      size_cap: Math.max(memberIds.length, 6),
      area_lat: originMeetup?.area_lat ?? null,
      area_lng: originMeetup?.area_lng ?? null,
      scheduled_at: scheduledAt.toISOString(),
      created_by: null,
      group_id: groupId,
    })
    .select("id")
    .single()
  if (meetupErr || !meetup) {
    return NextResponse.json({ error: "meetup_create_failed", detail: meetupErr?.message }, { status: 500 })
  }
  const meetupId = meetup.id as string

  const { error: memberInsertErr } = await supabase.from("meetup_members").insert(
    memberIds.map((userId) => ({
      meetup_id: meetupId,
      user_id: userId,
      // Already a known group, so both the accept dance and identity
      // reveal are moot; they've met before.
      accepted: true,
      revealed: true,
      reroll_used: false,
    }))
  )
  if (memberInsertErr) {
    return NextResponse.json({ error: "members_failed", detail: memberInsertErr.message }, { status: 500 })
  }

  let group_: GroupProfile
  try {
    group_ = await buildGroupProfileForMeetup(meetupId)
  } catch (err) {
    return NextResponse.json(
      { error: "profile_build_failed", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    )
  }

  const result = await allowAiRequest()
    ? await runVenueAgent(group_)
    : { recommendation: FALLBACK_RECOMMENDATION, steps: [], source: "fallback" as const }

  let rawPlacesJson: unknown = null
  if (result.source === "live") {
    try {
      rawPlacesJson = await placeDetails(result.recommendation.placeId)
    } catch {
      rawPlacesJson = null
    }
  }

  const { error: recErr } = await supabase.from("activity_recommendations").insert({
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
  if (recErr) {
    return NextResponse.json({ error: "recommendation_failed", detail: recErr.message }, { status: 500 })
  }

  return NextResponse.json({ meetupId, created: true })
}
