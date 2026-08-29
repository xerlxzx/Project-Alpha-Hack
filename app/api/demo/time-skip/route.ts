import { NextResponse } from "next/server"
import { z } from "zod"

import { assertMeetupMember, getCurrentUser } from "@/lib/current-user"
import { getAdminSupabase } from "@/lib/supabase/server"

// Demo-only: jumps a confirmed meetup to its outcome beat without waiting real
// time, making post-event feedback available during a short demo. Caller
// identity is resolved from the session, not the request body.
const RequestBodySchema = z.object({ meetupId: z.string().min(1) })

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
  const { meetupId } = parsed.data

  if (!(await assertMeetupMember(currentUser.id, meetupId))) {
    return NextResponse.json({ error: "not_a_member" }, { status: 403 })
  }

  const supabase = getAdminSupabase()

  const { data: meetup, error: loadError } = await supabase
    .from("meetups")
    .select("id, status, scheduled_at")
    .eq("id", meetupId)
    .maybeSingle()

  if (loadError) {
    return NextResponse.json({ error: "lookup_failed", detail: loadError.message }, { status: 500 })
  }
  if (!meetup) {
    return NextResponse.json({ error: "meetup_not_found" }, { status: 404 })
  }

  // Idempotent: re-running the demo returns the already-completed
  // state instead of erroring, so the pitch can be rehearsed repeatedly.
  if (meetup.status === "completed") {
    return NextResponse.json({ ok: true, status: "completed", alreadyCompleted: true })
  }
  if (meetup.status !== "confirmed") {
    return NextResponse.json({ error: "meetup_not_confirmed" }, { status: 409 })
  }

  // `meetups` has no `completed_at` column (see 0001_schema.sql).
  // the authoritative completion time is the `momentum_events.completed_at`
  // written by the feedback step. Here we also pull a future `scheduled_at`
  // back to now so the meetup reads as having just happened.
  const nowIso = new Date().toISOString()
  const scheduledAt =
    meetup.scheduled_at && new Date(meetup.scheduled_at).getTime() > Date.now()
      ? nowIso
      : meetup.scheduled_at

  const { error: updateError } = await supabase
    .from("meetups")
    .update({ status: "completed", scheduled_at: scheduledAt })
    .eq("id", meetupId)

  if (updateError) {
    return NextResponse.json({ error: "update_failed", detail: updateError.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, status: "completed" })
}
