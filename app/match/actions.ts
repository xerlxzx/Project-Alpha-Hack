"use server"

import { redirect } from "next/navigation"

import { assertMeetupMember, getCurrentUser } from "@/lib/current-user"
import { describeGenderMix } from "@/lib/matcher/match"
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
 * Resolves venue display fields from Places for a given recommendation.
 * Returns null for cached fallbacks and on Places errors.
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
  genderMix: string
  center: { lat: number; lng: number } | null
  members: AnonymisedMemberView[]
  explanation: string[]
}

/**
 * Rebuilds the match summary for `/match?meetupId=…`. Exposes only
 * verification status, age range, and shared interests per member.
 */
export async function getMeetupGroup(meetupId: string): Promise<MeetupGroupView | null> {
  const currentUser = await getCurrentUser()
  if (!currentUser) return null
  if (!(await assertMeetupMember(currentUser.id, meetupId))) return null

  const supabase = getAdminSupabase()

  const { data: meetup } = await supabase
    .from("meetups")
    .select("status, area_lat, area_lng")
    .eq("id", meetupId)
    .maybeSingle()

  if (!meetup) return null
  if (meetup.status === "confirmed" || meetup.status === "completed") {
    redirect(`/meetup/${meetupId}`)
  }

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
    supabase.from("preferences").select("user_id, interests, hobbies, gender").in("user_id", userIds),
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
  const genderById = new Map(
    (prefsRes.data ?? []).map((p) => [
      p.user_id as string,
      (p.gender as string | null) ?? null,
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

  return {
    meetupId,
    groupSize: userIds.length,
    genderMix: describeGenderMix(userIds.map((id) => genderById.get(id))),
    center,
    members,
    explanation,
  }
}
