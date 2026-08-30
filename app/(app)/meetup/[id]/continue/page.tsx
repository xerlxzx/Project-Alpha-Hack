import Link from "next/link"
import { redirect } from "next/navigation"
import { ArrowLeft, Users } from "lucide-react"

import { assertMeetupMember, getCurrentUser } from "@/lib/current-user"
import { getAdminSupabase } from "@/lib/supabase/server"
import { ContinueDecision, type ContinueMember } from "./ContinueDecision"

export default async function MeetupContinuePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: meetupId } = await params
  const currentUser = await getCurrentUser()
  if (!currentUser) redirect("/")

  if (!(await assertMeetupMember(currentUser.id, meetupId))) {
    return (
      <ContinueState
        title="Not your meetup"
        body="This decision is only available to people who joined this meetup."
        href="/"
        linkLabel="Back home"
      />
    )
  }

  const admin = getAdminSupabase()
  const { data: meetup } = await admin
    .from("meetups")
    .select("id, status, group_id")
    .eq("id", meetupId)
    .maybeSingle()

  if (!meetup) {
    return (
      <ContinueState
        title="Meetup not found"
        body="This meetup is no longer available."
        href="/"
        linkLabel="Back home"
      />
    )
  }

  if (meetup.status !== "completed") {
    return (
      <ContinueState
        title="Not just yet"
        body="This decision opens once the meetup is complete."
        href={`/meetup/${meetupId}`}
        linkLabel="Back to meetup"
      />
    )
  }

  // Same justification as the feedback page: profile_public only exposes
  // co-members of a `confirmed` meetup, and this one is `completed`, so the
  // admin client reads through the same 4-column allow-list instead.
  const [{ data: memberRows }, { data: selfMember }] = await Promise.all([
    admin.from("meetup_members").select("user_id").eq("meetup_id", meetupId),
    admin
      .from("meetup_members")
      .select("continue_vote")
      .eq("meetup_id", meetupId)
      .eq("user_id", currentUser.id)
      .maybeSingle(),
  ])

  const coMemberIds = (memberRows ?? [])
    .map((member) => member.user_id)
    .filter((userId) => userId !== currentUser.id)
  const { data: profileRows } =
    coMemberIds.length > 0
      ? await admin.from("profiles").select("user_id, first_name, photo_url").in("user_id", coMemberIds)
      : { data: [] }

  const members: ContinueMember[] = (profileRows ?? []).map((profile) => ({
    userId: profile.user_id,
    firstName: profile.first_name,
    photoUrl: profile.photo_url,
  }))

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-8 px-5 py-8 pb-28 sm:px-8 sm:py-12">
      <header className="flex flex-col gap-5">
        <Link
          href={`/meetup/${meetupId}`}
          className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Back to meetup
        </Link>

        <div className="flex flex-col gap-3">
          <span className="flex w-fit items-center gap-1.5 rounded-full bg-accent/10 px-3 py-1 text-xs font-semibold text-accent">
            <Users className="size-3.5" aria-hidden />
            One more thing
          </span>
          <div>
            <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
              Want to keep this group?
            </h1>
            <p className="mt-2 max-w-lg text-sm leading-6 text-muted-foreground">
              If enough of you say yes, Project Alpha turns this into a standing group and
              recommends a new activity for you each week.
            </p>
          </div>
        </div>
      </header>

      <ContinueDecision
        meetupId={meetupId}
        members={members}
        initialVote={selfMember?.continue_vote ?? null}
        initialGroupId={meetup.group_id}
      />
    </main>
  )
}

function ContinueState({
  title,
  body,
  href,
  linkLabel,
}: {
  title: string
  body: string
  href: string
  linkLabel: string
}) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-3 px-5 text-center">
      <h1 className="font-display text-2xl font-semibold text-foreground">{title}</h1>
      <p className="text-sm text-muted-foreground">{body}</p>
      <Link
        href={href}
        className="mt-2 inline-flex min-h-10 items-center rounded-full bg-accent px-5 text-sm font-semibold text-accent-foreground"
      >
        {linkLabel}
      </Link>
    </main>
  )
}
