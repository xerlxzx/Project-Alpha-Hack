import type { MomentumEvent } from "@/lib/types"

// Pure, deterministic momentum computations (PRD 9.18). No DB access, no
// side effects - callers pass in whatever event rows they've already
// fetched/joined.

/**
 * `MomentumEvent` rows carry a bare `week` int (Postgres `extract(week from
 * completed_at)`), which is ISO week-of-year with no year attached - it
 * repeats every year, so it can't distinguish "week 35 of 2025" from
 * "week 35 of 2026". The functions below deliberately ignore that stored
 * field and instead derive week identity from `completedAt` itself (which
 * every event still carries), computing a year+week key that's stable
 * across year boundaries. This is more correct than trusting `.week`, at
 * the cost of quietly diverging from the DB's own precomputed column -
 * flagging it here since it's a deliberate, non-obvious choice.
 */
function isoWeekThursday(date: Date): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  const dayNum = (d.getUTCDay() + 6) % 7 // Mon=0 .. Sun=6
  d.setUTCDate(d.getUTCDate() - dayNum + 3) // Thursday of this ISO week
  return d
}

function isoWeekNumber(thursday: Date): number {
  const isoYear = thursday.getUTCFullYear()
  const firstThursday = isoWeekThursday(new Date(Date.UTC(isoYear, 0, 4)))
  const weekMs = 7 * 24 * 60 * 60 * 1000
  return 1 + Math.round((thursday.getTime() - firstThursday.getTime()) / weekMs)
}

function weekKey(thursday: Date): string {
  return `${thursday.getUTCFullYear()}-${String(isoWeekNumber(thursday)).padStart(2, "0")}`
}

export interface WeeklyProgress {
  completed: number
  goal: number
  ratio: number
}

/**
 * Activities completed in the same ISO week as `now`. `ratio` is capped at
 * 1 even if `completed` exceeds `goal`, and is 0 when no goal is set
 * (`weeklyGoal <= 0`) rather than treating "no goal" as "always complete".
 */
export function activitiesThisWeek(
  events: MomentumEvent[],
  weeklyGoal: number,
  now: Date
): WeeklyProgress {
  const currentWeek = weekKey(isoWeekThursday(now))
  const completed = events.filter(
    (event) =>
      event.completedAt !== null &&
      weekKey(isoWeekThursday(new Date(event.completedAt))) === currentWeek
  ).length

  const ratio = weeklyGoal > 0 ? Math.min(completed / weeklyGoal, 1) : 0

  return { completed, goal: weeklyGoal, ratio }
}

/**
 * Consecutive weeks (walking backward from the most recent week with any
 * completed activity) that meet `weeklyGoal`. Stops at the first week that
 * falls short or has no completions at all. No `now` parameter by design -
 * "current week" here means "the latest week present in the data", keeping
 * this fully deterministic from `events` alone.
 */
export function weeklyStreak(events: MomentumEvent[], weeklyGoal: number): number {
  if (weeklyGoal <= 0) return 0

  const countsByWeek = new Map<string, number>()
  const thursdaysByWeek = new Map<string, Date>()

  for (const event of events) {
    if (event.completedAt === null) continue
    const thursday = isoWeekThursday(new Date(event.completedAt))
    const key = weekKey(thursday)
    countsByWeek.set(key, (countsByWeek.get(key) ?? 0) + 1)
    thursdaysByWeek.set(key, thursday)
  }

  if (thursdaysByWeek.size === 0) return 0

  let cursor = [...thursdaysByWeek.values()].reduce((latest, d) => (d > latest ? d : latest))
  const weekMs = 7 * 24 * 60 * 60 * 1000
  let streak = 0

  while ((countsByWeek.get(weekKey(cursor)) ?? 0) >= weeklyGoal) {
    streak += 1
    cursor = new Date(cursor.getTime() - weekMs)
  }

  return streak
}

/**
 * `MomentumEvent` alone has no category/place info - that lives on the
 * joined `ActivityRecommendation` row. Callers building a passport summary
 * join the two and pass the enriched shape; bare `MomentumEvent[]` still
 * works (categoriesTried/placesExplored just come back 0).
 */
export interface MomentumActivityRecord extends MomentumEvent {
  category?: string | null
  placeId?: string | null
}

export interface PassportSummary {
  categoriesTried: number
  placesExplored: number
  totalActivities: number
  level: number
}

/**
 * Level formula: `1 + floor(totalActivities / 5)` - level 1 at zero
 * completed activities, one level up per 5 completed activities. Simple,
 * monotonic, and easy to reason about for a v1; not tuned against any
 * particular pacing target.
 */
function levelFromTotal(totalActivities: number): number {
  return 1 + Math.floor(totalActivities / 5)
}

export function passportSummary(events: MomentumActivityRecord[]): PassportSummary {
  const completed = events.filter((event) => event.completedAt !== null)

  const categories = new Set(
    completed.map((event) => event.category).filter((category): category is string => !!category)
  )
  const places = new Set(
    completed.map((event) => event.placeId).filter((placeId): placeId is string => !!placeId)
  )

  return {
    categoriesTried: categories.size,
    placesExplored: places.size,
    totalActivities: completed.length,
    level: levelFromTotal(completed.length),
  }
}
