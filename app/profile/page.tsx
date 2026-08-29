import { getAdminSupabase } from "@/lib/supabase/server"
import {
  activitiesThisWeek,
  weeklyStreak,
  passportSummary,
  type MomentumActivityRecord,
} from "@/lib/momentum"
import type { MomentumEvent } from "@/lib/types"
import { MomentumRing } from "@/components/MomentumRing"
import { ActivityPassport } from "@/components/ActivityPassport"
import { ShareCard } from "@/components/ShareCard"

/**
 * No auth/session flow exists yet in this prototype, so there is no
 * `auth.uid()` for RLS to key off. `getServerSupabase()` (anon key, the
 * brief's suggested helper) was verified empirically to return zero rows
 * for this user's `momentum_events` - RLS silently filters everything out
 * with no session cookie - while the service-role client correctly returns
 * the seeded row. Using the admin client for this one hardcoded demo user
 * is a deliberate, scoped stand-in until real auth lands (see the report).
 */
const DEMO_USER_ID = "00000000-0000-0000-0001-000000000001"

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
  const supabase = getAdminSupabase()

  const [{ data: eventRows }, { data: prefRow }, { data: badgeRows }] = await Promise.all([
    supabase
      .from("momentum_events")
      .select("id, user_id, activity_id, week, completed_at, hours, created_at")
      .eq("user_id", DEMO_USER_ID),
    supabase.from("preferences").select("weekly_goal").eq("user_id", DEMO_USER_ID).maybeSingle(),
    supabase.from("badges").select("code").eq("user_id", DEMO_USER_ID),
  ])

  const events = (eventRows ?? []).map(toMomentumEvent)
  const weeklyGoal = prefRow?.weekly_goal ?? 0
  const badgeCodes = (badgeRows ?? []).map((row) => row.code)

  // `momentum_events` alone has no category/place columns - that data lives
  // on the joined `activity_recommendations` row. There is no `category`
  // column anywhere in the schema yet, so `categoriesTried` is honestly 0
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

  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-8 px-5 py-10">
      <header className="flex flex-col items-center gap-1 text-center">
        <p className="text-sm text-muted-foreground">Your Momentum</p>
        <h1 className="font-display text-2xl text-foreground">This week&apos;s progress</h1>
      </header>

      <MomentumRing
        completed={thisWeek.completed}
        goal={thisWeek.goal}
        label="Activities this week"
        streak={streak}
        badges={badgeCodes}
        className="mx-auto"
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
      />

      <ShareCard completed={thisWeek.completed} goal={thisWeek.goal} streak={streak} />
    </main>
  )
}
