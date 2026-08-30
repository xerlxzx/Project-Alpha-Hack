import { NextResponse } from "next/server"
import { z } from "zod"

import { assertMeetupMember, getCurrentUser } from "@/lib/current-user"
import { getAdminSupabase } from "@/lib/supabase/server"

// Records whether the caller wants to keep meeting this group after their
// first completed activity. Once at least two members opt in, the group is
// promoted into a persistent `groups` row that /group/[id] and
// /api/groups/[id]/plan build on. Auth resolves from the session; the user
// ID is never taken from the request body.

const RequestBodySchema = z.object({ stay: z.boolean() })

interface MemberRow {
  user_id: string
  continue_vote: boolean | null
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: meetupId } = await params

  const currentUser = await getCurrentUser()
  if (!currentUser) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }
  if (!(await assertMeetupMember(currentUser.id, meetupId))) {
    return NextResponse.json({ error: "not_a_member" }, { status: 403 })
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
  const { stay } = parsed.data

  const supabase = getAdminSupabase()

  const { data: meetup, error: meetupErr } = await supabase
    .from("meetups")
    .select("id, status, group_id")
    .eq("id", meetupId)
    .maybeSingle()
  if (meetupErr) {
    return NextResponse.json({ error: "lookup_failed", detail: meetupErr.message }, { status: 500 })
  }
  if (!meetup) {
    return NextResponse.json({ error: "not_found" }, { status: 404 })
  }
  if (meetup.status !== "completed") {
    return NextResponse.json({ error: "meetup_not_completed" }, { status: 409 })
  }

  const { error: voteErr } = await supabase
    .from("meetup_members")
    .update({ continue_vote: stay })
    .eq("meetup_id", meetupId)
    .eq("user_id", currentUser.id)
  if (voteErr) {
    return NextResponse.json({ error: "vote_failed", detail: voteErr.message }, { status: 500 })
  }

  // Already promoted (by this vote or an earlier one). Joining just adds the
  // caller into the existing group rather than re-running the threshold.
  if (meetup.group_id) {
    if (stay) {
      const { error: joinErr } = await supabase
        .from("group_members")
        .upsert(
          { group_id: meetup.group_id, user_id: currentUser.id, status: "active" },
          { onConflict: "group_id,user_id" }
        )
      if (joinErr) {
        return NextResponse.json({ error: "join_failed", detail: joinErr.message }, { status: 500 })
      }
    }
    return NextResponse.json({
      staying: stay,
      groupId: stay ? meetup.group_id : null,
      groupConfirmed: true,
    })
  }

  if (!stay) {
    return NextResponse.json({ staying: false, groupId: null, groupConfirmed: false })
  }

  const { data: memberRows, error: membersErr } = await supabase
    .from("meetup_members")
    .select("user_id, continue_vote")
    .eq("meetup_id", meetupId)
  if (membersErr || !memberRows) {
    return NextResponse.json({ error: "member_lookup_failed", detail: membersErr?.message }, { status: 500 })
  }
  const members = memberRows as MemberRow[]

  // Demo group-continuity simulation, mirroring accept/route.ts's quorum
  // fill: co-members are seeded users with no live session to cast their own
  // vote. If the caller's "stay" leaves the group short of the two-person
  // threshold, opt in enough still-undecided (never explicitly declined)
  // co-members so the group-confirmation flow is walkable solo.
  const votesFor = members.filter((m) => m.continue_vote === true).length
  if (votesFor < 2) {
    const undecided = members
      .filter((m) => m.user_id !== currentUser.id && m.continue_vote === null)
      .map((m) => m.user_id)
    const needed = 2 - votesFor
    const toSimulate = undecided.slice(0, needed)
    if (toSimulate.length > 0) {
      const { error: simErr } = await supabase
        .from("meetup_members")
        .update({ continue_vote: true })
        .eq("meetup_id", meetupId)
        .in("user_id", toSimulate)
      if (simErr) {
        return NextResponse.json({ error: "vote_sim_failed", detail: simErr.message }, { status: 500 })
      }
      for (const id of toSimulate) {
        const member = members.find((m) => m.user_id === id)
        if (member) member.continue_vote = true
      }
    }
  }

  const stayingIds = members.filter((m) => m.continue_vote === true).map((m) => m.user_id)
  const groupConfirmed = stayingIds.length >= 2

  if (!groupConfirmed) {
    return NextResponse.json({
      staying: true,
      groupId: null,
      groupConfirmed: false,
      votesFor: stayingIds.length,
    })
  }

  const { data: group, error: groupErr } = await supabase
    .from("groups")
    .insert({ origin_meetup_id: meetupId, status: "active" })
    .select("id")
    .single()
  if (groupErr || !group) {
    return NextResponse.json({ error: "group_create_failed", detail: groupErr?.message }, { status: 500 })
  }

  const { error: groupMembersErr } = await supabase
    .from("group_members")
    .insert(stayingIds.map((userId) => ({ group_id: group.id, user_id: userId, status: "active" })))
  if (groupMembersErr) {
    return NextResponse.json({ error: "group_members_failed", detail: groupMembersErr.message }, { status: 500 })
  }

  const { error: linkErr } = await supabase
    .from("meetups")
    .update({ group_id: group.id })
    .eq("id", meetupId)
  if (linkErr) {
    return NextResponse.json({ error: "link_failed", detail: linkErr.message }, { status: 500 })
  }

  return NextResponse.json({
    staying: true,
    groupId: group.id,
    groupConfirmed: true,
    votesFor: stayingIds.length,
  })
}
