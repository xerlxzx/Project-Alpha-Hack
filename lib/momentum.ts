import type { MomentumEvent } from "@/lib/types"

// Pure momentum computations. No DB access; callers pass in
// pre-fetched event rows.

/**
 * The stored `week` omits the year and repeats annually. Derive a stable
 * year-week key from `completedAt` instead.
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
 * 1 and stays 0 when `weeklyGoal <= 0`.
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
 * Counts consecutive goal-meeting weeks backward from the latest event week.
 * Stops at the first missing or incomplete week.
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
 * Category and place come from a joined ActivityRecommendation.
 * Bare MomentumEvents return zero categories and places.
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
 * Level formula: `1 + floor(totalActivities / 5)`.
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
