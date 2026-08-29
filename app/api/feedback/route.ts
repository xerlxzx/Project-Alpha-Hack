import { GoogleGenAI } from "@google/genai"
import { NextResponse } from "next/server"
import { createHash } from "node:crypto"
import { z } from "zod"

import { GEMINI_MODEL, getEnv } from "@/lib/config"
import { assertMeetupMember, getCurrentUser, type CurrentUser } from "@/lib/current-user"
import { getAdminSupabase, getServerSupabase } from "@/lib/supabase/server"

// The seeded demo IDs are valid Postgres UUID values with a zero version
// nibble, which Zod's RFC-version-aware `.uuid()` intentionally rejects.
const DatabaseUuidSchema = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)

const PersonSignalSchema = z
  .object({
    userId: DatabaseUuidSchema,
    meetAgain: z.boolean().default(false),
    avoidRematch: z.boolean().default(false),
  })
  .refine((signal) => !(signal.meetAgain && signal.avoidRematch), {
    message: "meetAgain and avoidRematch are mutually exclusive",
  })

const RequestBodySchema = z
  .object({
    meetupId: DatabaseUuidSchema,
    groupReaction: z.enum(["great_group", "easy_energy", "not_for_me"]).nullable().optional(),
    people: z.array(PersonSignalSchema).max(5).default([]),
    note: z.string().max(500).default(""),
  })
  .refine((body) => new Set(body.people.map((person) => person.userId)).size === body.people.length, {
    message: "Feedback recipients must be unique",
  })

const PreferenceSignalSchema = z.object({
  tags: z.array(z.string().min(1).max(40)).max(6),
  sentiment: z.enum(["positive", "neutral", "negative"]),
})

type PreferenceSignal = z.infer<typeof PreferenceSignalSchema>
type PersonSignal = z.infer<typeof PersonSignalSchema>

interface FeedbackRow {
  id: string
  about_user: string | null
  meet_again: boolean | null
  avoid_rematch: boolean | null
  note: string | null
}

interface FeedbackInsert {
  id: string
  meetup_id: string
  from_user: string
  about_user: string | null
  group_reaction: string | null
  meet_again: boolean
  avoid_rematch: boolean
  note: string | null
}

async function getWriteClient(user: CurrentUser) {
  return user.isDemo ? getAdminSupabase() : await getServerSupabase()
}

type WriteClient = Awaited<ReturnType<typeof getWriteClient>>

function normalizeTags(tags: string[]): string[] {
  const seen = new Set<string>()
  return tags.flatMap((raw) => {
    const tag = raw.trim()
    const key = tag.toLowerCase()
    if (!tag || seen.has(key)) return []
    seen.add(key)
    return [tag]
  })
}

async function derivePreferenceSignal(
  note: string
): Promise<{ signal: PreferenceSignal | null; warning: string | null }> {
  const prompt = [
    "Convert this private post-meetup note into future matching preferences.",
    "Return short activity/setting tags only when directly supported by the note.",
    "Classify the writer's sentiment as positive, neutral, or negative.",
    "Do not infer venue facts, identities, or sensitive traits.",
    "Return ONLY JSON matching the supplied schema.",
    `Private note: ${JSON.stringify(note)}`,
  ].join("\n")

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const ai = new GoogleGenAI({ apiKey: getEnv("GEMINI_API_KEY") })
      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: z.toJSONSchema(PreferenceSignalSchema),
        },
      })
      if (!response.text) throw new Error("Gemini returned no structured output")
      const parsed = PreferenceSignalSchema.parse(JSON.parse(response.text))
      return {
        signal: { ...parsed, tags: normalizeTags(parsed.tags) },
        warning: null,
      }
    } catch {
      // Retry exactly once. Feedback and deterministic outcomes remain available
      // if both attempts fail; the warning is persisted with the private note.
    }
  }

  return {
    signal: null,
    warning: "Your feedback was saved, but the private note could not be interpreted yet.",
  }
}

function stableUuid(scope: "feedback" | "momentum", ...parts: string[]): string {
  const hex = createHash("sha256")
    .update([scope, ...parts].join(":"))
    .digest("hex")
    .slice(0, 32)
    .split("")

  // RFC 9562 UUIDv8 custom/variant bits over deterministic SHA-256 bytes.
  hex[12] = "8"
  hex[16] = ((Number.parseInt(hex[16], 16) & 0x3) | 0x8).toString(16)
  const value = hex.join("")
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`
}

function isUniqueViolation(error: { code?: string } | null): boolean {
  return error?.code === "23505"
}

function readStoredFeedback(row: FeedbackRow): {
  signal: PreferenceSignal | null
  people: PersonSignal[]
  warning: string | null
} {
  let stored: unknown
  try {
    stored = row.note ? JSON.parse(row.note) : null
  } catch {
    stored = null
  }

  const object =
    stored && typeof stored === "object" ? (stored as Record<string, unknown>) : null
  const signalResult = PreferenceSignalSchema.safeParse(object?.preferenceSignal)
  const peopleResult = z.array(PersonSignalSchema).safeParse(object?.personSignals)
  const fallbackPeople =
    row.about_user && (row.meet_again || row.avoid_rematch)
      ? [
          {
            userId: row.about_user,
            meetAgain: Boolean(row.meet_again),
            avoidRematch: Boolean(row.avoid_rematch),
          },
        ]
      : []

  return {
    signal: signalResult.success ? signalResult.data : null,
    people: peopleResult.success ? peopleResult.data : fallbackPeople,
    warning: typeof object?.interpretationWarning === "string" ? object.interpretationWarning : null,
  }
}

function isoWeekNumber(date: Date): number {
  const utc = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  const day = utc.getUTCDay() || 7
  utc.setUTCDate(utc.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1))
  return Math.ceil(((utc.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
}

async function ensureMomentumEvent(userId: string, meetupId: string) {
  const admin = getAdminSupabase()
  const { data: activity, error: activityError } = await admin
    .from("activity_recommendations")
    .select("id")
    .eq("meetup_id", meetupId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (activityError) throw new Error(`activity_lookup_failed:${activityError.message}`)
  if (!activity) throw new Error("activity_not_found")

  const { data: existing, error: existingError } = await admin
    .from("momentum_events")
    .select("id")
    .eq("user_id", userId)
    .eq("activity_id", activity.id)
    .limit(1)
    .maybeSingle()

  if (existingError) throw new Error(`momentum_lookup_failed:${existingError.message}`)
  if (existing) return false

  const completedAt = new Date()
  const eventId = stableUuid("momentum", userId, activity.id)
  const { error } = await admin.from("momentum_events").insert({
    id: eventId,
    user_id: userId,
    activity_id: activity.id,
    week: isoWeekNumber(completedAt),
    completed_at: completedAt.toISOString(),
    hours: null,
  })
  if (error) {
    if (!isUniqueViolation(error)) {
      throw new Error(`momentum_insert_failed:${error.message}`)
    }

    const { data: winner, error: winnerError } = await admin
      .from("momentum_events")
      .select("id")
      .eq("id", eventId)
      .maybeSingle()
    if (winnerError || !winner) {
      throw new Error(`momentum_reread_failed:${winnerError?.message ?? "row missing"}`)
    }
    return false
  }
  return true
}

async function reconnectUsers(
  userId: string,
  meetupId: string,
  people: PersonSignal[]
): Promise<string[]> {
  const admin = getAdminSupabase()
  const reconnectedIds: string[] = []

  for (const person of people) {
    const otherId = person.userId
    if (!person.meetAgain || otherId === userId) continue

    const [userA, userB] = [userId, otherId].sort()
    const { data: friendship, error: friendshipError } = await admin
      .from("friendships")
      .select("id")
      .or(
        `and(user_a.eq.${userA},user_b.eq.${userB}),and(user_a.eq.${userB},user_b.eq.${userA})`
      )
      .limit(1)
      .maybeSingle()
    if (friendshipError) throw new Error(`friendship_lookup_failed:${friendshipError.message}`)

    if (friendship) {
      reconnectedIds.push(otherId)
      continue
    }

    const { data: reciprocalRows, error: reciprocalError } = await admin
      .from("feedback")
      .select(FEEDBACK_SELECT)
      .eq("meetup_id", meetupId)
      .eq("from_user", otherId)
    if (reciprocalError) throw new Error(`reciprocal_lookup_failed:${reciprocalError.message}`)
    const reciprocal = (reciprocalRows ?? []).some(
      (feedback) =>
        (feedback.about_user === userId && feedback.meet_again) ||
        readStoredFeedback(feedback).people.some(
          (person) => person.userId === userId && person.meetAgain
        )
    )
    if (!reciprocal) continue

    const { error: insertError } = await admin.from("friendships").upsert(
      { user_a: userA, user_b: userB, via_meetup: meetupId },
      { onConflict: "user_a,user_b", ignoreDuplicates: true }
    )
    if (insertError) throw new Error(`friendship_insert_failed:${insertError.message}`)
    reconnectedIds.push(otherId)
  }

  if (reconnectedIds.length === 0) return []

  const { data: profiles, error: profileError } = await admin
    .from("profiles")
    .select("user_id, first_name")
    .in("user_id", reconnectedIds)
  if (profileError) throw new Error(`profile_lookup_failed:${profileError.message}`)

  const nameById = new Map((profiles ?? []).map((profile) => [profile.user_id, profile.first_name]))
  return [...new Set(reconnectedIds)].map((id) => nameById.get(id) ?? "a group member")
}

const FEEDBACK_SELECT = "id, about_user, meet_again, avoid_rematch, note" as const

async function findExistingFeedback(
  client: WriteClient,
  userId: string,
  meetupId: string
): Promise<FeedbackRow | null> {
  const { data, error } = await client
    .from("feedback")
    .select(FEEDBACK_SELECT)
    .eq("meetup_id", meetupId)
    .eq("from_user", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(`feedback_lookup_failed:${error.message}`)
  return data
}

async function insertFeedback(
  client: WriteClient,
  row: FeedbackInsert
): Promise<{ row: FeedbackRow; inserted: boolean }> {
  const { data, error } = await client.from("feedback").insert(row).select(FEEDBACK_SELECT).single()
  if (!error && data) return { row: data, inserted: true }
  if (!isUniqueViolation(error)) {
    throw new Error(`feedback_insert_failed:${error?.message ?? "row missing"}`)
  }

  // A concurrent request with the same caller/meetup uses the same primary
  // key. The winner's persisted payload is authoritative for all side effects.
  const { data: winner, error: winnerError } = await client
    .from("feedback")
    .select(FEEDBACK_SELECT)
    .eq("id", row.id)
    .maybeSingle()
  if (winnerError || !winner) {
    throw new Error(`feedback_reread_failed:${winnerError?.message ?? "row missing"}`)
  }
  return { row: winner, inserted: false }
}

async function applyPreferenceSignal(
  client: WriteClient,
  userId: string,
  signal: PreferenceSignal | null
): Promise<boolean> {
  if (!signal || signal.tags.length === 0) return false

  const { data: preferences, error: lookupError } = await client
    .from("preferences")
    .select("interests")
    .eq("user_id", userId)
    .maybeSingle()
  if (lookupError) throw new Error(`preference_lookup_failed:${lookupError.message}`)

  const currentInterests = (preferences?.interests ?? []) as string[]
  const mergedInterests = normalizeTags([...currentInterests, ...signal.tags])
  if (mergedInterests.length === currentInterests.length) return false

  const { error: updateError } = await client
    .from("preferences")
    .update({ interests: mergedInterests })
    .eq("user_id", userId)
  if (updateError) throw new Error(`preference_update_failed:${updateError.message}`)
  return true
}

export async function POST(request: Request) {
  const currentUser = await getCurrentUser()
  if (!currentUser) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 })
  }

  const parsed = RequestBodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 })
  }

  const { meetupId, groupReaction = null, note } = parsed.data
  if (!(await assertMeetupMember(currentUser.id, meetupId))) {
    return NextResponse.json({ error: "not_a_member" }, { status: 403 })
  }

  const admin = getAdminSupabase()
  const { data: meetup, error: meetupError } = await admin
    .from("meetups")
    .select("id, status")
    .eq("id", meetupId)
    .maybeSingle()
  if (meetupError) {
    return NextResponse.json({ error: "lookup_failed", detail: meetupError.message }, { status: 500 })
  }
  if (!meetup) {
    return NextResponse.json({ error: "meetup_not_found" }, { status: 404 })
  }
  if (meetup.status !== "completed") {
    return NextResponse.json({ error: "meetup_not_completed" }, { status: 409 })
  }

  const { data: members, error: membersError } = await admin
    .from("meetup_members")
    .select("user_id")
    .eq("meetup_id", meetupId)
  if (membersError) {
    return NextResponse.json({ error: "member_lookup_failed", detail: membersError.message }, { status: 500 })
  }

  const coMemberIds = new Set(
    (members ?? []).map((member) => member.user_id).filter((id) => id !== currentUser.id)
  )
  if (parsed.data.people.some((person) => !coMemberIds.has(person.userId))) {
    return NextResponse.json({ error: "invalid_feedback_recipient" }, { status: 400 })
  }

  const writeClient = await getWriteClient(currentUser)
  try {
    const existing = await findExistingFeedback(writeClient, currentUser.id, meetupId)
    let persisted: FeedbackRow
    let inserted = false

    if (existing) {
      persisted = existing
    } else {
      const trimmedNote = note.trim()
      const interpretation = trimmedNote
        ? await derivePreferenceSignal(trimmedNote)
        : { signal: null, warning: null }
      const selectedPeople = parsed.data.people.filter(
        (person) => person.meetAgain || person.avoidRematch
      )
      const primaryPerson = selectedPeople[0] ?? null
      const result = await insertFeedback(writeClient, {
        id: stableUuid("feedback", meetupId, currentUser.id),
        meetup_id: meetupId,
        from_user: currentUser.id,
        about_user: primaryPerson?.userId ?? null,
        group_reaction: groupReaction,
        meet_again: primaryPerson?.meetAgain ?? false,
        avoid_rematch: primaryPerson?.avoidRematch ?? false,
        note: JSON.stringify({
          text: trimmedNote,
          preferenceSignal: interpretation.signal,
          personSignals: selectedPeople,
          interpretationWarning: interpretation.warning,
        }),
      })
      persisted = result.row
      inserted = result.inserted
    }

    // The feedback row (including its validated signal or AI warning) is
    // durable before any preference mutation. Retrying always reuses this
    // persisted payload, so a different Gemini result cannot compound tags.
    const stored = readStoredFeedback(persisted)
    const momentumAdded = await ensureMomentumEvent(currentUser.id, meetupId)
    const reconnectedWith = await reconnectUsers(currentUser.id, meetupId, stored.people)
    const preferenceUpdated = await applyPreferenceSignal(
      writeClient,
      currentUser.id,
      stored.signal
    )

    return NextResponse.json({
      ok: true,
      alreadySubmitted: !inserted,
      momentumAdded,
      preferenceUpdated,
      derivedSignal: stored.signal,
      interpretationWarning: stored.warning,
      reconnectedWith,
    })
  } catch (error) {
    const detail = error instanceof Error ? error.message : "feedback_failed"
    return NextResponse.json({ error: "feedback_failed", detail }, { status: 500 })
  }
}
