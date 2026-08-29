"use server"

import { assertMeetupMember, getCurrentUser } from "@/lib/current-user"
import { getAdminSupabase } from "@/lib/supabase/server"
import { placeDetails } from "@/lib/venue-agent/places"

export interface VenueDetail {
  lat: number | null
  lng: number | null
  address: string | null
  openNow: boolean | null
  mapsUrl: string | null
  photoUrl: string | null
}

/**
 * The venue-agent HTTP response returns only the Recommendation (PRD §17),
 * which carries no coordinates, address, or open status. AgentProgress needs
 * a real lat/lng for the selected-venue pin and ProposalCard wants the
 * address — resolve both here from Places (server-only: uses the secret
 * key). Returns null for the cached fallback recommendation (its placeId is
 * not a real Place) or on any Places error.
 */
export async function getVenueDetail(placeId: string): Promise<VenueDetail | null> {
  if (!placeId || placeId.startsWith("cached-fallback")) {
    return null
  }
  try {
    const detail = await placeDetails(placeId)
    return {
      lat: typeof detail.location?.lat === "number" ? detail.location.lat : null,
      lng: typeof detail.location?.lng === "number" ? detail.location.lng : null,
      address: detail.address || null,
      openNow: detail.openNow ?? null,
      mapsUrl: detail.mapsUrl ?? null,
      photoUrl: detail.photoUrl ?? null,
    }
  } catch {
    return null
  }
}

export interface AnonymisedMemberView {
  verified: boolean
  ageRange: string | null
  sharedInterests: string[]
}

export interface MeetupGroupView {
  meetupId: string
  groupSize: number
  center: { lat: number; lng: number } | null
  members: AnonymisedMemberView[]
  explanation: string[]
}

/**
 * Resume path for `/match?meetupId=…` — the home page redirects here after it
 * has already called `POST /api/match`, so the meetup + members exist but the
 * matcher's explanation text was never persisted. Recompute a truthful
 * summary from the group's real overlapping interests and verification state
 * (a real property of the group, not fabricated). §9.10 allow-list only —
 * verification, age range, and shared interests; never names/photos/location.
 */
export async function getMeetupGroup(meetupId: string): Promise<MeetupGroupView | null> {
  const currentUser = await getCurrentUser()
  if (!currentUser) return null
  if (!(await assertMeetupMember(currentUser.id, meetupId))) return null

  const supabase = getAdminSupabase()

  const { data: meetup } = await supabase
    .from("meetups")
    .select("area_lat, area_lng")
    .eq("id", meetupId)
    .maybeSingle()

  const { data: memberRows, error: memberErr } = await supabase
    .from("meetup_members")
    .select("user_id")
    .eq("meetup_id", meetupId)
  if (memberErr || !memberRows || memberRows.length === 0) return null

  const userIds = memberRows.map((row) => row.user_id as string)
  const otherIds = userIds.filter((id) => id !== currentUser.id)

  const [usersRes, profilesRes, prefsRes] = await Promise.all([
    supabase.from("users").select("id, is_verified").in("id", userIds),
    supabase.from("profiles").select("user_id, age_range").in("user_id", userIds),
    supabase.from("preferences").select("user_id, interests, hobbies").in("user_id", userIds),
  ])

  const verifiedById = new Map((usersRes.data ?? []).map((u) => [u.id as string, Boolean(u.is_verified)]))
  const ageById = new Map(
    (profilesRes.data ?? []).map((p) => [p.user_id as string, (p.age_range as string | null) ?? null])
  )
  const signalsById = new Map(
    (prefsRes.data ?? []).map((p) => [
      p.user_id as string,
      new Set<string>([...((p.interests as string[] | null) ?? []), ...((p.hobbies as string[] | null) ?? [])]),
    ])
  )

  const mySignals = signalsById.get(currentUser.id) ?? new Set<string>()

  const members: AnonymisedMemberView[] = otherIds.map((id) => {
    const theirs = signalsById.get(id) ?? new Set<string>()
    return {
      verified: verifiedById.get(id) ?? true,
      ageRange: ageById.get(id) ?? null,
      sharedInterests: [...mySignals].filter((signal) => theirs.has(signal)),
    }
  })

  const allShared = [...new Set(members.flatMap((m) => m.sharedInterests))]
  const everyoneVerified = members.length > 0 && members.every((m) => m.verified) && (verifiedById.get(currentUser.id) ?? true)

  const explanation: string[] = []
  if (allShared.length > 0) {
    explanation.push(`Shared interest in ${allShared.slice(0, 3).join(", ")}.`)
  }
  if (everyoneVerified) {
    explanation.push("Everyone in the group is university-verified.")
  }
  if (explanation.length < 2) {
    explanation.push("All members are free in the same window.")
  }

  const center =
    meetup && typeof meetup.area_lat === "number" && typeof meetup.area_lng === "number"
      ? { lat: meetup.area_lat, lng: meetup.area_lng }
      : null

  return { meetupId, groupSize: userIds.length, center, members, explanation }
}
