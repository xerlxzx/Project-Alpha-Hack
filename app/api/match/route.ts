// POST /api/match performs deterministic group matching. Gates and scoring via
// lib/matcher; venue selection runs separately after the group confirms.
import { getAdminSupabase } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/current-user"
import { buildMatch, describeGenderMix } from "@/lib/matcher/match"
import { loadMatchInputs, type MatchPoolMember } from "@/lib/matcher/loadPool"
import { MatchRequestSchema, requestedMeetupTime } from "@/lib/matcher/request"

// Pre-acceptance disclosure fields only. No names, photos, contact info,
// exact location, reliability, or reports.
interface AnonymisedMember {
  verified: boolean
  ageRange: string | null
  sharedInterests: string[]
}

interface ReadyResponse {
  meetupId: string
  status: "ready"
  groupSize: number
  genderMix: string
  members: AnonymisedMember[]
  explanation: string[]
}

interface InsufficientResponse {
  status: "insufficient"
  nearestFuture: { startAt: string } | null
  suggestion: { meetupId: string; activityIntent: string | null; tags: string[] | null; scheduledAt: string | null } | null
}

function sharedInterestsOf(activeUser: { interests: string[]; hobbies: string[] }, candidate: { interests: string[]; hobbies: string[] }): string[] {
  const candidateSignals = new Set([...candidate.interests, ...candidate.hobbies])
  const activeSignals = [...new Set([...activeUser.interests, ...activeUser.hobbies])]
  return activeSignals.filter((signal) => candidateSignals.has(signal))
}

function centroid(points: Array<{ lat: number | null | undefined; lng: number | null | undefined }>): { lat: number; lng: number } | null {
  const valid = points.filter(
    (p): p is { lat: number; lng: number } => typeof p.lat === "number" && typeof p.lng === "number"
  )
  if (valid.length === 0) return null
  const lat = valid.reduce((sum, p) => sum + p.lat, 0) / valid.length
  const lng = valid.reduce((sum, p) => sum + p.lng, 0) / valid.length
  return { lat, lng }
}

async function findNearestFuture(supabase: ReturnType<typeof getAdminSupabase>, now: Date) {
  const { data, error } = await supabase
    .from("availability_windows")
    .select("start_at")
    .gt("start_at", now.toISOString())
    .order("start_at", { ascending: true })
    .limit(1)
  if (error) throw new Error(`Failed to load nearest future availability: ${error.message}`)
  const row = data?.[0]
  return row ? { startAt: row.start_at as string } : null
}

async function findSeededSuggestion(supabase: ReturnType<typeof getAdminSupabase>) {
  const { data, error } = await supabase
    .from("meetups")
    .select("id, activity_intent, tags, scheduled_at")
    .eq("status", "forming")
    .not("created_by", "is", null)
    .order("scheduled_at", { ascending: true })
    .limit(1)
  if (error) throw new Error(`Failed to load seeded suggestion: ${error.message}`)
  const row = data?.[0]
  return row
    ? {
        meetupId: row.id as string,
        activityIntent: row.activity_intent as string | null,
        tags: row.tags as string[] | null,
        scheduledAt: row.scheduled_at as string | null,
      }
    : null
}

export async function POST(request: Request): Promise<Response> {
  let rawBody: unknown = {}
  try {
    const text = await request.text()
    if (text) rawBody = JSON.parse(text)
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const parsedBody = MatchRequestSchema.safeParse(rawBody)
  if (!parsedBody.success) {
    return Response.json(
      { error: "Invalid match request", issues: parsedBody.error.issues },
      { status: 400 }
    )
  }
  const body = parsedBody.data

  const currentUser = await getCurrentUser()
  if (!currentUser) {
    return Response.json({ error: "Unauthenticated" }, { status: 401 })
  }
  const activeUserId = currentUser.id
  const now = new Date()
  const supabase = getAdminSupabase()

  let activeUser, pool: MatchPoolMember[], blockedPairs
  try {
    ;({ activeUser, pool, blockedPairs } = await loadMatchInputs(supabase, activeUserId, body))
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Failed to load match inputs" }, { status: 404 })
  }

  let result = buildMatch(activeUser, pool, { blockedPairs, now })

  // Demo fallback: the seed timestamps availability windows at seed time, so
  // they expire and the availability gate wipes the pool in a stale-seed
  // environment (same problem /api/nearby works around). For the sessionless
  // demo user, retry ignoring availability so a group always forms. A real
  // session, or a live deployment with fresh windows, never hits this branch.
  if (result.status === "insufficient" && currentUser.isDemo) {
    result = buildMatch(activeUser, pool, { blockedPairs, now, relaxAvailability: true })
  }

  if (result.status === "insufficient") {
    const [nearestFuture, suggestion] = await Promise.all([
      findNearestFuture(supabase, now),
      findSeededSuggestion(supabase),
    ])
    const response: InsufficientResponse = { status: "insufficient", nearestFuture, suggestion }
    return Response.json(response)
  }

  const poolById = new Map(pool.map((member) => [member.id, member]))
  const groupCentroid = centroid([
    { lat: activeUser.areaLat, lng: activeUser.areaLng },
    ...result.members.map((m) => {
      const member = poolById.get(m.userId)
      return { lat: member?.areaLat, lng: member?.areaLng }
    }),
  ])

  const { data: meetupRow, error: meetupError } = await supabase
    .from("meetups")
    .insert({
      status: "forming",
      area_lat: groupCentroid?.lat ?? null,
      area_lng: groupCentroid?.lng ?? null,
      scheduled_at: requestedMeetupTime(body),
      created_by: null,
    })
    .select("id")
    .single()

  if (meetupError || !meetupRow) {
    return Response.json({ error: meetupError?.message ?? "Failed to persist meetup" }, { status: 500 })
  }

  const meetupId = meetupRow.id as string
  const memberRows = [activeUserId, ...result.members.map((m) => m.userId)].map((userId) => ({
    meetup_id: meetupId,
    user_id: userId,
    accepted: false,
    revealed: false,
    reroll_used: false,
  }))

  const { error: membersError } = await supabase.from("meetup_members").insert(memberRows)
  if (membersError) {
    return Response.json({ error: membersError.message }, { status: 500 })
  }

  const anonymisedMembers: AnonymisedMember[] = result.members.map((m) => {
    const member = poolById.get(m.userId)
    return {
      verified: member?.verified ?? true,
      ageRange: member?.ageRange ?? null,
      sharedInterests: member ? sharedInterestsOf(activeUser, member) : [],
    }
  })

  const response: ReadyResponse = {
    meetupId,
    status: "ready",
    groupSize: result.members.length + 1,
    genderMix: describeGenderMix([
      activeUser.gender,
      ...result.members.map((member) => poolById.get(member.userId)?.gender),
    ]),
    members: anonymisedMembers,
    explanation: result.explanation,
  }
  return Response.json(response)
}
