import Link from "next/link"
import { redirect } from "next/navigation"
import { UsersRound } from "lucide-react"

import { getServerSupabase, getAdminSupabase } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/current-user"
import {
  activitiesThisWeek,
  weeklyStreak,
  passportSummary,
  type MomentumActivityRecord,
} from "@/lib/momentum"
import type { MomentumEvent } from "@/lib/types"
import { MomentumRing } from "@/components/MomentumRing"
import { ActivityPassport } from "@/components/ActivityPassport"
import { ConnectionMap } from "@/components/ConnectionMap"
import { ShareCard } from "@/components/ShareCard"
import { ProfileHeader } from "@/components/ProfileHeader"
import { GlassPanel } from "@/components/GlassPanel"

interface MomentumEventRow {
  id: string
  user_id: string
  activity_id: string | null
  week: number
  completed_at: string | null
  hours: number | null
  created_at: string
}

function toMomentumEvent(row: MomentumEventRow): MomentumEvent {
  return {
    id: row.id,
    userId: row.user_id,
    activityId: row.activity_id,
    week: row.week,
    completedAt: row.completed_at,
    hours: row.hours,
    createdAt: row.created_at,
  }
}

export default async function ProfilePage() {
  const currentUser = await getCurrentUser()
  if (!currentUser) {
    // No session, and demo mode is disabled - the root page hosts the only
    // sign-in surface in this app (AuthPanel + DemoLogin), not a dedicated
    // /sign-in route.
    redirect("/")
  }

  // A real session (including one established via the demo-login magic
  // link, which is a genuine Supabase Auth session for the seeded user) has
  // its own `auth.uid()`, so `getServerSupabase()` sees the same rows RLS
  // already scopes to this user - no need for the admin client. Only the
  // hardcoded env-var fallback path (`isDemo`, no session cookie at all)
  // still needs it, since RLS has no `auth.uid()` to match against then.
  const supabase = currentUser.isDemo ? getAdminSupabase() : await getServerSupabase()
  const userId = currentUser.id

  const [{ data: eventRows }, { data: profileRow }, { data: prefRow }, { data: badgeRows }] =
    await Promise.all([
      supabase
        .from("momentum_events")
        .select("id, user_id, activity_id, week, completed_at, hours, created_at")
        .eq("user_id", userId),
      supabase
        .from("profiles")
        .select("first_name, photo_url, age_range, university, course_year")
        .eq("user_id", userId)
        .maybeSingle(),
      supabase
        .from("preferences")
        .select(
          "weekly_goal, travel_km, budget_aud, interests, gender_pref, language_pref, accessibility, social_energy, notify_match_found, notify_meetup_reminders, notify_weekly_summary"
        )
        .eq("user_id", userId)
        .maybeSingle(),
      supabase.from("badges").select("code").eq("user_id", userId),
    ])

  const { data: activeGroupMembership } = await supabase
    .from("group_members")
    .select("group_id")
    .eq("user_id", userId)
    .eq("status", "active")
    .limit(1)
    .maybeSingle()

  const events = (eventRows ?? []).map(toMomentumEvent)
  const weeklyGoal = prefRow?.weekly_goal ?? 0
  const badgeCodes = (badgeRows ?? []).map((row) => row.code)

  // `momentum_events` alone has no category/place columns; that data lives
  // on the joined `activity_recommendations` row. There is no `category`
  // column anywhere in the schema yet, so `categoriesTried` is 0
  // below rather than a fabricated guess; `placeId` is real, joined here.
  const activityIds = events
    .map((event) => event.activityId)
    .filter((id): id is string => id !== null)

  const { data: activityRows } = activityIds.length
    ? await supabase.from("activity_recommendations").select("id, place_id").in("id", activityIds)
    : { data: [] as { id: string; place_id: string | null }[] }

  const placeByActivityId = new Map((activityRows ?? []).map((row) => [row.id, row.place_id]))

  const enrichedEvents: MomentumActivityRecord[] = events.map((event) => ({
    ...event,
    placeId: event.activityId ? (placeByActivityId.get(event.activityId) ?? null) : null,
  }))

  const now = new Date()
  const thisWeek = activitiesThisWeek(events, weeklyGoal, now)
  const streak = weeklyStreak(events, weeklyGoal)
  const passport = passportSummary(enrichedEvents)
  const totalHours = events.reduce((sum, event) => sum + (event.hours ?? 0), 0)

  const profile = {
    firstName: profileRow?.first_name ?? "You",
    photoUrl: profileRow?.photo_url ?? null,
    ageRange: profileRow?.age_range ?? null,
    university: profileRow?.university ?? "",
    courseYear: profileRow?.course_year ?? null,
  }

  const preferences = {
    weeklyGoal: weeklyGoal > 0 ? weeklyGoal : 3,
    travelKm: prefRow?.travel_km ?? null,
    budgetAud: prefRow?.budget_aud ?? null,
    interests: prefRow?.interests ?? [],
    genderPref: prefRow?.gender_pref ?? null,
    languagePref: prefRow?.language_pref ?? null,
    accessibility: prefRow?.accessibility ?? null,
    socialEnergy: prefRow?.social_energy ?? null,
    notifyMatchFound: prefRow?.notify_match_found ?? true,
    notifyMeetupReminders: prefRow?.notify_meetup_reminders ?? true,
    notifyWeeklySummary: prefRow?.notify_weekly_summary ?? false,
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-6 px-5 py-10">
      <ProfileHeader profile={profile} preferences={preferences} isDemo={currentUser.isDemo} />

      <GlassPanel
        role="region"
        withTextBacking
        backingClassName="bg-surface/60 dark:bg-surface/40"
        aria-label="This week's progress"
        className="flex flex-col items-center gap-6 p-6"
      >
        <MomentumRing
          completed={thisWeek.completed}
          goal={thisWeek.goal}
          label="Activities this week"
          streak={streak}
          badges={badgeCodes}
        />

        <ActivityPassport
          thisWeek={thisWeek}
          streak={streak}
          totalHours={totalHours > 0 ? totalHours : null}
          categoriesTried={passport.categoriesTried}
          placesExplored={passport.placesExplored}
          totalActivities={passport.totalActivities}
          level={passport.level}
          badges={badgeCodes}
          className="w-full border-t border-border pt-6"
        />
      </GlassPanel>

      {activeGroupMembership && (
        <Link
          href={`/group/${activeGroupMembership.group_id}`}
          className="flex items-center gap-3 rounded-2xl border border-accent/30 bg-accent/5 p-4 transition-colors hover:border-accent/50"
        >
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-accent/10 text-accent">
            <UsersRound className="size-5" aria-hidden />
          </span>
          <span className="flex flex-col">
            <span className="font-heading text-sm font-semibold text-foreground">Your group</span>
            <span className="text-xs text-muted-foreground">
              See this week&apos;s activity, or organize a new one
            </span>
          </span>
        </Link>
      )}

      <ConnectionMap />

      <ShareCard completed={thisWeek.completed} goal={thisWeek.goal} streak={streak} />
    </main>
  )
}
