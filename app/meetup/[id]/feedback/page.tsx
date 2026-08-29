import Link from "next/link"
import { redirect } from "next/navigation"
import { ArrowLeft, CheckCircle2 } from "lucide-react"

import { assertMeetupMember, getCurrentUser } from "@/lib/current-user"
import { getAdminSupabase } from "@/lib/supabase/server"
import { FeedbackForm, type FeedbackMember } from "./FeedbackForm"

export default async function MeetupFeedbackPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: meetupId } = await params
  const currentUser = await getCurrentUser()
  if (!currentUser) redirect("/")

  if (!(await assertMeetupMember(currentUser.id, meetupId))) {
    return (
      <FeedbackState
        title="Not your meetup"
        body="Feedback is only available to people who joined this meetup."
        href="/"
        linkLabel="Back home"
      />
    )
  }

  // Membership is established above. The allow-listed profile query uses
  // the admin client because profile_public intentionally stops exposing
  // co-members once a meetup leaves `confirmed`.
  const admin = getAdminSupabase()
  const { data: meetup } = await admin
    .from("meetups")
    .select("id, status")
    .eq("id", meetupId)
    .maybeSingle()

  if (!meetup) {
    return (
      <FeedbackState
        title="Meetup not found"
        body="This meetup is no longer available."
        href="/"
        linkLabel="Back home"
      />
    )
  }

  if (meetup.status !== "completed") {
    return (
      <FeedbackState
        title="Feedback opens afterwards"
        body="Once the meetup is complete, this takes only a few seconds."
        href={`/meetup/${meetupId}`}
        linkLabel="Back to meetup"
      />
    )
  }

  const [{ data: memberRows }, { data: recommendation }] = await Promise.all([
    admin.from("meetup_members").select("user_id").eq("meetup_id", meetupId),
    admin
      .from("activity_recommendations")
      .select("activity_title, venue_name")
      .eq("meetup_id", meetupId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  const coMemberIds = (memberRows ?? [])
    .map((member) => member.user_id)
    .filter((userId) => userId !== currentUser.id)
  const { data: profileRows } =
    coMemberIds.length > 0
      ? await admin
          .from("profiles")
          .select("user_id, first_name, photo_url")
          .in("user_id", coMemberIds)
      : { data: [] }

  const members: FeedbackMember[] = (profileRows ?? []).map((profile) => ({
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
            <CheckCircle2 className="size-3.5" aria-hidden />
            Meetup complete
          </span>
          <div>
            <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
              Keep the good momentum.
            </h1>
            <p className="mt-2 max-w-lg text-sm leading-6 text-muted-foreground">
              A few private taps after{" "}
              <span className="font-medium text-foreground">
                {recommendation?.activity_title ?? "your meetup"}
              </span>
              {recommendation?.venue_name ? ` at ${recommendation.venue_name}` : ""}. Done in
              seconds.
            </p>
          </div>
        </div>
      </header>

      <FeedbackForm meetupId={meetupId} members={members} />
    </main>
  )
}

function FeedbackState({
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
