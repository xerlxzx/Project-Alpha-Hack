// Server-only module (transitively, via lib/supabase/server.ts's
// next/headers import — see that file's own note on why there's no
// `server-only` package guarding this).
import { getServerSupabase, getAdminSupabase } from "@/lib/supabase/server"

// The seeded active user from supabase/seed.sql — the one demo identity
// every prototype screen can fall back to until real accounts exist.
export const DEMO_USER_ID = "00000000-0000-0000-0001-000000000001"

export interface CurrentUser {
  id: string
  isDemo: boolean
}

/**
 * Resolves the current user for a server request. A real signed-in session
 * always wins. With no session, falls back to the seeded demo user only if
 * demo mode is allowed (PRD §0 — allowed by default; set env `DEMO_MODE`
 * to the literal string `"false"` to disable it, e.g. for a production
 * deployment). Returns `null` when there's no session and demo mode is
 * disabled.
 *
 * Never reads a user id from request/client input — the only inputs are
 * the session cookie (via `getServerSupabase().auth.getUser()`, which
 * re-validates against Supabase Auth rather than trusting a local JWT
 * decode) and server-side env config.
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const supabase = await getServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user) {
    return { id: user.id, isDemo: false }
  }

  const demoAllowed = process.env.DEMO_MODE !== "false"
  if (demoAllowed) {
    return { id: DEMO_USER_ID, isDemo: true }
  }

  return null
}

/**
 * Authoritative (meetupId, userId) membership check, independent of the
 * caller's own session/RLS context. Deliberately uses the admin client:
 * `meetup_members`'s RLS requires `auth.uid() = user_id`, which would
 * incorrectly reject a legitimate check for the demo user (who has no real
 * auth session) even when the row genuinely exists. This function is the
 * authorization boundary itself, not a query running under the caller's
 * own privileges — callers should treat a `false` result (including on a
 * query error) as "not authorized."
 */
export async function assertMeetupMember(userId: string, meetupId: string): Promise<boolean> {
  const supabase = getAdminSupabase()
  const { data, error } = await supabase
    .from("meetup_members")
    .select("id")
    .eq("meetup_id", meetupId)
    .eq("user_id", userId)
    .maybeSingle()

  if (error) {
    return false
  }

  return data !== null
}
