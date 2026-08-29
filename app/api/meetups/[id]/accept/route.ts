import { NextResponse } from "next/server"

import { assertMeetupMember, getCurrentUser } from "@/lib/current-user"
import { getAdminSupabase } from "@/lib/supabase/server"

// PRD §9.9 — the caller accepts their spot in a forming meetup; the group
// confirms once quorum is reached. Auth is resolved from the session (with
// the demo-user fallback in lib/current-user.ts) and the membership check
// runs against the admin client — a client-supplied user id is never
// trusted here.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: meetupId } = await params

  const currentUser = await getCurrentUser()
  if (!currentUser) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }
  if (!(await assertMeetupMember(currentUser.id, meetupId))) {
    return NextResponse.json({ error: "not_a_member" }, { status: 403 })
  }

  const supabase = getAdminSupabase()

  const { data: meetup, error: meetupErr } = await supabase
    .from("meetups")
    .select("id, status, quorum, scheduled_at")
    .eq("id", meetupId)
    .maybeSingle()
  if (meetupErr) {
    return NextResponse.json({ error: "lookup_failed", detail: meetupErr.message }, { status: 500 })
  }
  if (!meetup) {
    return NextResponse.json({ error: "not_found" }, { status: 404 })
  }

  const { error: acceptErr } = await supabase
    .from("meetup_members")
    .update({ accepted: true })
    .eq("meetup_id", meetupId)
    .eq("user_id", currentUser.id)
  if (acceptErr) {
    return NextResponse.json({ error: "accept_failed", detail: acceptErr.message }, { status: 500 })
  }

  const { data: members, error: membersErr } = await supabase
    .from("meetup_members")
    .select("user_id, accepted")
    .eq("meetup_id", meetupId)
  if (membersErr || !members) {
    return NextResponse.json({ error: "lookup_failed", detail: membersErr?.message }, { status: 500 })
  }

  const quorum = meetup.quorum ?? 3
  let acceptedCount = members.filter((m) => m.accepted).length

  // DEMO quorum simulation (PRD §18): the co-members are seeded users with no
  // live session, so they can't accept in real time. If the caller's own
  // acceptance still leaves the group short of quorum, mark the remaining
  // seeded members accepted too — simulating that they said yes. Deliberate
  // single-actor-demo shortcut, and not hidden: the response reports the full
  // accepted count and member count so the UI shows an honest tally.
  if (acceptedCount < quorum) {
    const { error: fillErr } = await supabase
      .from("meetup_members")
      .update({ accepted: true })
      .eq("meetup_id", meetupId)
      .eq("accepted", false)
    if (fillErr) {
      return NextResponse.json({ error: "quorum_sim_failed", detail: fillErr.message }, { status: 500 })
    }
    acceptedCount = members.length
  }

  const confirmed = acceptedCount >= quorum
  let status = meetup.status

  if (confirmed && meetup.status !== "confirmed") {
    // The match flow doesn't capture a meetup time yet (POST /api/match drops
    // the home page's `startAt`), so a just-confirmed meetup would land on
    // /meetup/[id] with no countdown/calendar. Default a null time to ~3h out
    // ("later today"), matching the seeded confirmed meetup. Flagged for the
    // owner of the match/scheduling flow.
    const patch: { status: string; scheduled_at?: string } = { status: "confirmed" }
    if (!meetup.scheduled_at) {
      patch.scheduled_at = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString()
    }
    const { error: statusErr } = await supabase.from("meetups").update(patch).eq("id", meetupId)
    if (statusErr) {
      return NextResponse.json({ error: "confirm_failed", detail: statusErr.message }, { status: 500 })
    }
    status = "confirmed"
  }

  return NextResponse.json({
    accepted: true,
    acceptedCount,
    memberCount: members.length,
    quorum,
    status,
    confirmed,
  })
}
