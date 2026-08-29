// Server-only through lib/supabase/server.ts's next/headers import.
import { getServerSupabase, getAdminSupabase } from "@/lib/supabase/server"

// Seeded active user from supabase/seed.sql.
export const DEMO_USER_ID = "00000000-0000-0000-0001-000000000001"

export interface CurrentUser {
  id: string
  isDemo: boolean
}

/**
 * Returns the current user for a server request. A real signed-in session
 * wins; otherwise falls back to the seeded demo user if `DEMO_MODE` is not
 * `"false"`. Returns `null` when there's no session and demo mode is off.
 *
 * User ID comes from the session cookie via `getServerSupabase().auth.getUser()`,
 * which re-validates against Supabase Auth. Never reads from request input.
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
 * Authoritative membership check. The admin client supports the sessionless
 * demo user, whose auth.uid() cannot satisfy meetup_members RLS.
 * Treat false, including query errors, as unauthorized.
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

export interface ActiveMeetup {
  id: string
  status: "forming" | "confirmed"
}

/**
 * The user's current forming/confirmed meetup, if any (ignores completed
 * ones). Used to route the nav bar's Meetup/Messages tabs. Wrapped so a
 * missing session or unapplied migration degrades to "no active meetup"
 * instead of crashing the tab bar.
 */
export async function getActiveMeetup(userId: string): Promise<ActiveMeetup | null> {
  try {
    const supabase = getAdminSupabase()
    const { data, error } = await supabase
      .from("meetup_members")
      .select("meetup_id, meetups(status)")
      .eq("user_id", userId)
      .eq("accepted", true)

    if (error || !data) {
      return null
    }

    type Row = { meetup_id: string; meetups: { status: string } | { status: string }[] | null }
    const rows = data as unknown as Row[]
    const statusOf = (row: Row) =>
      Array.isArray(row.meetups) ? row.meetups[0]?.status : row.meetups?.status

    const active = rows.find((row) => {
      const status = statusOf(row)
      return status === "confirmed" || status === "forming"
    })
    if (!active) return null

    const status = statusOf(active)
    return { id: active.meetup_id, status: status === "confirmed" ? "confirmed" : "forming" }
  } catch {
    return null
  }
}
