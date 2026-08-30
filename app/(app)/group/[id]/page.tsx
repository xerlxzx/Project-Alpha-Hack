import Link from "next/link"
import { redirect } from "next/navigation"
import { ArrowLeft, UsersRound } from "lucide-react"

import { assertGroupMember, getCurrentUser } from "@/lib/current-user"
import { getAdminSupabase } from "@/lib/supabase/server"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { GroupHome, type GroupActiveMeetup, type GroupMember } from "./GroupHome"

const WHEN_FORMATTER = new Intl.DateTimeFormat("en-AU", {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "Australia/Sydney",
})

export default async function GroupPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: groupId } = await params
  const currentUser = await getCurrentUser()
  if (!currentUser) redirect("/")

  if (!(await assertGroupMember(currentUser.id, groupId))) {
    return (
      <EmptyState
        title="Not your group"
        body="This standing group is only visible to its members."
      />
    )
  }

  const admin = getAdminSupabase()

  // group_members isn't covered by can_view_profile at all, so co-member
  // profiles read through the admin client's same 4-column allow-list used
  // by the feedback and continue pages.
  const [{ data: groupRow }, { data: memberRows }] = await Promise.all([
    admin.from("groups").select("id, status").eq("id", groupId).maybeSingle(),
    admin.from("group_members").select("user_id").eq("group_id", groupId).eq("status", "active"),
  ])

  if (!groupRow) {
    return <EmptyState title="Group not found" body="This group is no longer available." />
  }

  const memberIds = (memberRows ?? []).map((row) => row.user_id)
  const { data: profileRows } =
    memberIds.length > 0
      ? await admin.from("profiles").select("user_id, first_name, photo_url").in("user_id", memberIds)
      : { data: [] }

  const members: GroupMember[] = (profileRows ?? []).map((profile) => ({
    userId: profile.user_id,
    firstName: profile.first_name,
    photoUrl: profile.photo_url,
    isYou: profile.user_id === currentUser.id,
  }))

  const { data: meetupRow } = await admin
    .from("meetups")
    .select("id, status, scheduled_at")
    .eq("group_id", groupId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  let activeMeetup: GroupActiveMeetup | null = null
  if (meetupRow && meetupRow.status !== "completed") {
    const { data: recommendation } = await admin
      .from("activity_recommendations")
      .select("activity_title, venue_name")
      .eq("meetup_id", meetupRow.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    activeMeetup = {
      id: meetupRow.id,
      activityTitle: recommendation?.activity_title ?? null,
      venueName: recommendation?.venue_name ?? null,
      whenLabel: meetupRow.scheduled_at ? WHEN_FORMATTER.format(new Date(meetupRow.scheduled_at)) : null,
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-8 px-5 py-8 pb-28 sm:px-8 sm:py-12">
      <header className="flex flex-col gap-5">
        <Link
          href="/profile"
          className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Back to profile
        </Link>

        <div className="flex flex-col gap-3">
          <span className="flex w-fit items-center gap-1.5 rounded-full bg-accent/10 px-3 py-1 text-xs font-semibold text-accent">
            <UsersRound className="size-3.5" aria-hidden />
            Standing group
          </span>
          <div>
            <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
              Your group
            </h1>
            <p className="mt-2 max-w-lg text-sm leading-6 text-muted-foreground">
              Project Alpha picks a new activity for you all each week.
            </p>
          </div>
        </div>
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-lg font-semibold text-foreground">The group</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {members.map((member) => (
            <div
              key={member.userId}
              className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-card p-4 text-center"
            >
              <Avatar size="lg">
                <AvatarImage src={member.photoUrl ?? undefined} alt={member.firstName} />
                <AvatarFallback>{member.firstName.slice(0, 1)}</AvatarFallback>
              </Avatar>
              <div className="text-sm font-medium text-foreground">
                {member.firstName}
                {member.isYou && <span className="text-muted-foreground"> (you)</span>}
              </div>
            </div>
          ))}
        </div>
      </section>

      <GroupHome groupId={groupId} activeMeetup={activeMeetup} />
    </main>
  )
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-3 px-5 text-center">
      <h1 className="font-display text-2xl font-semibold text-foreground">{title}</h1>
      <p className="text-sm text-muted-foreground">{body}</p>
      <Link
        href="/home"
        className="mt-2 inline-flex min-h-10 items-center rounded-full bg-accent px-5 text-sm font-semibold text-accent-foreground"
      >
        Back home
      </Link>
    </main>
  )
}
