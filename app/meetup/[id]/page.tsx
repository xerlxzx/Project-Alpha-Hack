import Link from "next/link"
import { notFound } from "next/navigation"
import { CalendarClock, CheckCircle2, MapPin } from "lucide-react"

import { getAdminSupabase, getServerSupabase } from "@/lib/supabase/server"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { ChatThread, MemberReveal, type ChatMember, type ChatMessage } from "@/components/ChatThread"
import { LockMeIn } from "@/components/Countdown"
import { DemoTimeSkip } from "@/components/DemoTimeSkip"
import { SafetyActions } from "@/components/SafetyActions"

// Same convention as app/layout.tsx, app/profile/page.tsx, and
// app/onboarding/actions.ts: fall back to the seeded active demo user when
// there's no real Supabase Auth session yet (Task 4.1's sign-in/demo-login
// flow hasn't landed). Reads fall back to the admin client for that case.
// note `profile_public` itself calls `auth.uid()` internally, so it
// returns zero rows with no session regardless of which client runs the
// query (same failure mode documented in app/profile/page.tsx); the
// fallback branch below queries `profiles` directly instead, but with the
// exact same 4-column allow-list, so the §9.11 privacy contract is
// enforced by the SELECT list either way, not only by RLS.
const DEMO_USER_ID = "00000000-0000-0000-0001-000000000001"

const ALLOWED_PROFILE_FIELDS = "user_id, first_name, photo_url, university, course_year" as const

interface PublicProfileRow {
  user_id: string
  first_name: string
  photo_url: string | null
  university: string | null
  course_year: string | null
}

async function getViewer() {
  const supabase = await getServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user) {
    return { userId: user.id, client: supabase, hasSession: true as const }
  }
  return { userId: DEMO_USER_ID, client: getAdminSupabase(), hasSession: false as const }
}

export default async function MeetupPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const { userId, client, hasSession } = await getViewer()

  const { data: meetup } = await client
    .from("meetups")
    .select("id, status, scheduled_at, area_lat, area_lng")
    .eq("id", id)
    .maybeSingle()

  if (!meetup) {
    notFound()
  }

  const { data: memberRows } = await client
    .from("meetup_members")
    .select("user_id")
    .eq("meetup_id", id)

  const memberIds = (memberRows ?? []).map((row) => row.user_id)
  const isMember = memberIds.includes(userId)

  if (!isMember) {
    return (
      <EmptyState
        title="Not your meetup"
        body="You're not a member of this confirmed meetup."
      />
    )
  }

  if (meetup.status === "completed") {
    return <CompletedMeetup meetupId={id} />
  }

  if (meetup.status !== "confirmed") {
    return (
      <EmptyState
        title="Not confirmed yet"
        body="This meetup hasn't reached quorum, so there's nothing to reveal yet."
      />
    )
  }

  const { data: profileRows } = hasSession
    ? await client
        .from("profile_public")
        .select(ALLOWED_PROFILE_FIELDS)
        .in("user_id", memberIds)
    : await client
        .from("profiles")
        .select(ALLOWED_PROFILE_FIELDS)
        .in("user_id", memberIds)

  const members: Record<string, ChatMember> = {}
  const memberProfiles = (profileRows ?? []) as PublicProfileRow[]
  for (const profile of memberProfiles) {
    members[profile.user_id] = {
      userId: profile.user_id,
      firstName: profile.first_name,
      photoUrl: profile.photo_url,
    }
  }

  const { data: recommendation } = await client
    .from("activity_recommendations")
    .select("venue_name, activity_title, reason, est_cost_aud, est_distance_km, booking_url")
    .eq("meetup_id", id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  const { data: messageRows } = await client
    .from("chat_messages")
    .select("id, user_id, body, created_at")
    .eq("meetup_id", id)
    .order("created_at", { ascending: true })

  const initialMessages: ChatMessage[] = (messageRows ?? []).map((row) => ({
    id: row.id,
    userId: row.user_id,
    body: row.body,
    createdAt: row.created_at,
  }))

  const memberList = Object.values(members)
  const otherMembers = memberList.filter((member) => member.userId !== userId)
  const scheduledLabel = meetup.scheduled_at
    ? new Intl.DateTimeFormat("en-AU", {
        weekday: "short",
        hour: "numeric",
        minute: "2-digit",
      }).format(new Date(meetup.scheduled_at))
    : "Time TBC"

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-8 px-4 py-10 sm:px-6">
      <header className="flex flex-col gap-1">
        <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
          ← Back
        </Link>
        <h1 className="font-display text-2xl font-semibold text-foreground">
          {recommendation?.activity_title ?? "Your confirmed meetup"}
        </h1>
        <p className="text-sm text-muted-foreground">
          Everyone said yes — here&apos;s who&apos;s coming.
        </p>
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-lg font-semibold text-foreground">The group</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {memberList.map((member, i) => (
            <MemberReveal key={member.userId} delay={i * 0.08}>
              <div className="flex flex-col items-center gap-2 rounded-2xl bg-card p-4 text-center ring-1 ring-foreground/10">
                <Avatar size="lg">
                  <AvatarImage src={member.photoUrl ?? undefined} alt={member.firstName} />
                  <AvatarFallback>{member.firstName.slice(0, 1)}</AvatarFallback>
                </Avatar>
                <div>
                  <div className="text-sm font-medium text-foreground">
                    {member.firstName}
                    {member.userId === userId && (
                      <span className="text-muted-foreground"> (you)</span>
                    )}
                  </div>
                </div>
              </div>
            </MemberReveal>
          ))}
        </div>
      </section>

      <PinnedActivityCard
        scheduledLabel={scheduledLabel}
        venueName={recommendation?.venue_name ?? null}
        reason={recommendation?.reason ?? null}
      />

      {otherMembers.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="font-display text-lg font-semibold text-foreground">Safety</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {otherMembers.map((member, index) => (
              <div
                key={member.userId}
                className="rounded-2xl bg-card p-4 ring-1 ring-foreground/10"
              >
                <p className="mb-3 text-sm font-medium text-foreground">{member.firstName}</p>
                <SafetyActions
                  targetUserId={member.userId}
                  targetLabel={member.firstName}
                  meetupId={id}
                  showTrustedContact={index === 0}
                />
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-lg font-semibold text-foreground">Group chat</h2>
        <ChatThread
          meetupId={id}
          currentUserId={userId}
          initialMessages={initialMessages}
          members={members}
        />
      </section>

      <LockMeIn
        meetupId={id}
        activityTitle={recommendation?.activity_title ?? "Your meetup"}
        venueName={recommendation?.venue_name ?? "TBC"}
        scheduledAt={meetup.scheduled_at}
      />
      <DemoTimeSkip meetupId={id} />
    </main>
  )
}

function PinnedActivityCard({
  scheduledLabel,
  venueName,
  reason,
}: {
  scheduledLabel: string
  venueName: string | null
  reason: string | null
}) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-card p-4 ring-1 ring-foreground/10">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <span className="flex items-center gap-1.5 font-medium text-foreground">
          <CalendarClock className="size-4 text-muted-foreground" aria-hidden />
          {scheduledLabel}
        </span>
        {venueName && (
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <MapPin className="size-4" aria-hidden />
            {venueName}
          </span>
        )}
      </div>
      {reason && <p className="text-sm text-muted-foreground">{reason}</p>}
    </div>
  )
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <main className="mx-auto flex max-w-md flex-col items-center gap-3 px-4 py-24 text-center">
      <h1 className="font-display text-xl font-semibold text-foreground">{title}</h1>
      <p className="text-sm text-muted-foreground">{body}</p>
      <Link href="/" className="text-sm font-medium text-accent hover:underline">
        ← Back home
      </Link>
    </main>
  )
}

function CompletedMeetup({ meetupId }: { meetupId: string }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-5 px-5 text-center">
      <div className="grid size-14 place-items-center rounded-full bg-accent/10 text-accent">
        <CheckCircle2 className="size-7" aria-hidden />
      </div>
      <div className="flex flex-col gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">
          Meetup complete
        </p>
        <h1 className="font-display text-3xl font-semibold text-foreground">
          How did it feel?
        </h1>
        <p className="text-sm leading-6 text-muted-foreground">
          A few private taps help shape your next match and update your Project Alpha.
        </p>
      </div>
      <Link
        href={`/meetup/${meetupId}/feedback`}
        className="inline-flex min-h-12 items-center justify-center rounded-full bg-accent px-7 text-base font-semibold text-accent-foreground shadow-lg shadow-accent/25 transition-transform motion-safe:hover:-translate-y-0.5 motion-safe:active:translate-y-0"
      >
        Give feedback
      </Link>
    </main>
  )
}
