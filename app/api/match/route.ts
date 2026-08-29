// POST /api/match — PRD §16. Deterministic group matching only: gates and
// scoring (lib/matcher) decide eligibility/ranking, never an LLM. Venue
// selection is explicitly out of scope here (PRD §9.8) — it runs later,
// against an accepted group, as its own route.
import { getAdminSupabase } from "@/lib/supabase/server"
import { buildMatch } from "@/lib/matcher/match"
import { loadMatchInputs, type MatchPoolMember, type RequestOverrides } from "@/lib/matcher/loadPool"

// The seeded active demo user (supabase/seed.sql) — used whenever the caller
// doesn't specify one, per the brief's "default to the seeded active user
// for the demo".
const DEFAULT_ACTIVE_USER_ID = "00000000-0000-0000-0001-000000000001"

interface MatchRequestBody extends RequestOverrides {
  activeUserId?: string
}

// PRD §9.10 pre-acceptance disclosure — ONLY these fields. No names, photos,
// contact info, exact location, reliability, or reports.
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
  let body: MatchRequestBody = {}
  try {
    const text = await request.text()
    if (text) body = JSON.parse(text) as MatchRequestBody
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const activeUserId = body.activeUserId ?? DEFAULT_ACTIVE_USER_ID
  const now = new Date()
  const supabase = getAdminSupabase()

  let activeUser, pool: MatchPoolMember[], blockedPairs
  try {
    ;({ activeUser, pool, blockedPairs } = await loadMatchInputs(supabase, activeUserId, body))
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Failed to load match inputs" }, { status: 404 })
  }

  const result = buildMatch(activeUser, pool, { blockedPairs, now })

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
    // No gender-identity field exists anywhere in the schema (`gender_pref`
    // on `preferences` is a partner-gender filter, not the user's own
    // gender) — nothing to compute this from without fabricating data.
    genderMix: "not tracked — no gender field in current schema",
    members: anonymisedMembers,
    explanation: result.explanation,
  }
  return Response.json(response)
}
