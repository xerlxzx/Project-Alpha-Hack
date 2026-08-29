import { GoogleGenAI } from "@google/genai"
import { NextResponse } from "next/server"
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

interface FeedbackRow {
  about_user: string | null
  meet_again: boolean | null
}

interface FeedbackInsert {
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

async function derivePreferenceSignal(note: string): Promise<PreferenceSignal> {
  const ai = new GoogleGenAI({ apiKey: getEnv("GEMINI_API_KEY") })
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
      return { ...parsed, tags: normalizeTags(parsed.tags) }
    } catch {
      // Retry exactly once. We do not invent a preference signal if both attempts fail.
    }
  }

  throw new Error("preference_signal_failed")
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
  const { error } = await admin.from("momentum_events").insert({
    user_id: userId,
    activity_id: activity.id,
    week: isoWeekNumber(completedAt),
    completed_at: completedAt.toISOString(),
    hours: null,
  })
  if (error) throw new Error(`momentum_insert_failed:${error.message}`)
  return true
}

async function reconnectUsers(
  userId: string,
  meetupId: string,
  feedbackRows: FeedbackRow[]
): Promise<string[]> {
  const admin = getAdminSupabase()
  const reconnectedIds: string[] = []

  for (const row of feedbackRows) {
    const otherId = row.about_user
    if (!row.meet_again || !otherId || otherId === userId) continue

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

    const { data: reciprocal, error: reciprocalError } = await admin
      .from("feedback")
      .select("id")
      .eq("meetup_id", meetupId)
      .eq("from_user", otherId)
      .eq("about_user", userId)
      .eq("meet_again", true)
      .limit(1)
      .maybeSingle()
    if (reciprocalError) throw new Error(`reciprocal_lookup_failed:${reciprocalError.message}`)
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
  const { data: existingRows, error: existingError } = await writeClient
    .from("feedback")
    .select("about_user, meet_again")
    .eq("meetup_id", meetupId)
    .eq("from_user", currentUser.id)
  if (existingError) {
    return NextResponse.json({ error: "feedback_lookup_failed", detail: existingError.message }, { status: 500 })
  }

  try {
    // A retried request resumes the two server-computed outcomes without
    // duplicating private feedback or re-interpreting its note.
    if (existingRows && existingRows.length > 0) {
      const momentumAdded = await ensureMomentumEvent(currentUser.id, meetupId)
      const reconnectedWith = await reconnectUsers(currentUser.id, meetupId, existingRows)
      return NextResponse.json({
        ok: true,
        alreadySubmitted: true,
        momentumAdded,
        preferenceUpdated: false,
        derivedSignal: null,
        reconnectedWith,
      })
    }

    const trimmedNote = note.trim()
    const derivedSignal = trimmedNote ? await derivePreferenceSignal(trimmedNote) : null
    const selectedPeople = parsed.data.people.filter(
      (person) => person.meetAgain || person.avoidRematch
    )
    const rows: FeedbackInsert[] =
      selectedPeople.length > 0
        ? selectedPeople.map((person, index) => ({
            meetup_id: meetupId,
            from_user: currentUser.id,
            about_user: person.userId,
            group_reaction: index === 0 ? groupReaction : null,
            meet_again: person.meetAgain,
            avoid_rematch: person.avoidRematch,
            note:
              index === 0 && trimmedNote
                ? JSON.stringify({ text: trimmedNote, preferenceSignal: derivedSignal })
                : null,
          }))
        : [
            {
              meetup_id: meetupId,
              from_user: currentUser.id,
              about_user: null,
              group_reaction: groupReaction,
              meet_again: false,
              avoid_rematch: false,
              note: trimmedNote
                ? JSON.stringify({ text: trimmedNote, preferenceSignal: derivedSignal })
                : null,
            },
          ]

    let preferenceUpdated = false
    if (derivedSignal && derivedSignal.tags.length > 0) {
      const { data: preferences, error: preferenceLookupError } = await writeClient
        .from("preferences")
        .select("interests")
        .eq("user_id", currentUser.id)
        .maybeSingle()
      if (preferenceLookupError) {
        throw new Error(`preference_lookup_failed:${preferenceLookupError.message}`)
      }

      const currentInterests = (preferences?.interests ?? []) as string[]
      const mergedInterests = normalizeTags([...currentInterests, ...derivedSignal.tags])
      preferenceUpdated = mergedInterests.length > currentInterests.length
      if (preferenceUpdated) {
        const { error: preferenceUpdateError } = await writeClient
          .from("preferences")
          .update({ interests: mergedInterests })
          .eq("user_id", currentUser.id)
        if (preferenceUpdateError) {
          throw new Error(`preference_update_failed:${preferenceUpdateError.message}`)
        }
      }
    }

    // Preference updates happen before feedback insertion. If feedback
    // insertion fails, a retry can safely merge the same deduplicated tags;
    // once feedback exists, retries only resume server-computed outcomes.
    const { data: insertedRows, error: insertError } = await writeClient
      .from("feedback")
      .insert(rows)
      .select("about_user, meet_again")
    if (insertError) throw new Error(`feedback_insert_failed:${insertError.message}`)

    const momentumAdded = await ensureMomentumEvent(currentUser.id, meetupId)
    const reconnectedWith = await reconnectUsers(
      currentUser.id,
      meetupId,
      insertedRows ?? []
    )

    return NextResponse.json({
      ok: true,
      alreadySubmitted: false,
      momentumAdded,
      preferenceUpdated,
      derivedSignal,
      reconnectedWith,
    })
  } catch (error) {
    const detail = error instanceof Error ? error.message : "feedback_failed"
    const status = detail === "preference_signal_failed" ? 502 : 500
    return NextResponse.json({ error: "feedback_failed", detail }, { status })
  }
}
