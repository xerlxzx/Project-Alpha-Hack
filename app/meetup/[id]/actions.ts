"use server"

import { revalidatePath } from "next/cache"

import { getAdminSupabase, getServerSupabase } from "@/lib/supabase/server"

// Same convention as app/layout.tsx, app/profile/page.tsx, and
// app/onboarding/actions.ts: fall back to the seeded active demo user
// whenever there's no real Supabase Auth session yet (Task 4.1's
// sign-in/demo-login flow hasn't landed).
const DEMO_USER_ID = "00000000-0000-0000-0001-000000000001"

const MAX_MESSAGE_LENGTH = 2000

export interface SentChatMessage {
  id: string
  user_id: string
  body: string
  created_at: string
}

export type SendChatMessageResult =
  | { data: SentChatMessage; error?: undefined }
  | { data?: undefined; error: string }

/**
 * Persists a chat message for the active user. With a real session, this
 * runs through `getServerSupabase()` — the `chat_messages_insert_member`
 * RLS policy (0001_schema.sql) enforces `user_id = auth.uid() AND
 * is_meetup_member(meetup_id)` at the database layer regardless of what
 * this function does. Only when there's no session yet do we fall back to
 * the admin client for the seeded demo user, and in that case we re-check
 * membership by hand below, since the admin client bypasses RLS entirely.
 */
export async function sendChatMessage(
  meetupId: string,
  body: string
): Promise<SendChatMessageResult> {
  const trimmed = body.trim()

  if (!trimmed) {
    return { error: "Message can't be empty." }
  }
  if (trimmed.length > MAX_MESSAGE_LENGTH) {
    return { error: `Message is too long (max ${MAX_MESSAGE_LENGTH} characters).` }
  }

  const supabase = await getServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const userId = user?.id ?? DEMO_USER_ID
  const client = user ? supabase : getAdminSupabase()

  if (!user) {
    const { data: membership } = await client
      .from("meetup_members")
      .select("user_id")
      .eq("meetup_id", meetupId)
      .eq("user_id", userId)
      .maybeSingle()

    if (!membership) {
      return { error: "You're not a member of this meetup." }
    }
  }

  const { data, error } = await client
    .from("chat_messages")
    .insert({ meetup_id: meetupId, user_id: userId, body: trimmed })
    .select("id, user_id, body, created_at")
    .single()

  if (error || !data) {
    return { error: error?.message ?? "Failed to send message." }
  }

  revalidatePath(`/meetup/${meetupId}`)

  return { data }
}
