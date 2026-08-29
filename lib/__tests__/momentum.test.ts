import { describe, expect, it } from "vitest"
import type { MomentumEvent } from "@/lib/types"
import {
  activitiesThisWeek,
  weeklyStreak,
  passportSummary,
  type MomentumActivityRecord,
} from "@/lib/momentum"

function makeEvent(overrides: Partial<MomentumActivityRecord> = {}): MomentumActivityRecord {
  const base: MomentumEvent = {
    id: "event-1",
    userId: "user-1",
    activityId: null,
    week: 1,
    completedAt: "2026-08-24T10:00:00Z",
    hours: null,
    createdAt: "2026-08-24T10:00:00Z",
  }
  return { ...base, ...overrides }
}

describe("activitiesThisWeek", () => {
  it("counts only completed events that fall in the current week", () => {
    const now = new Date("2026-08-26T12:00:00Z") // Wednesday of that ISO week
    const events = [
      makeEvent({ id: "a", completedAt: "2026-08-24T10:00:00Z" }), // Monday, same week
      makeEvent({ id: "b", completedAt: "2026-08-17T10:00:00Z" }), // previous week
      makeEvent({ id: "c", completedAt: null }), // not completed
    ]
    const result = activitiesThisWeek(events, 2, now)
    expect(result.completed).toBe(1)
    expect(result.goal).toBe(2)
  })

  it("caps ratio at 1 when completed exceeds goal", () => {
    const now = new Date("2026-08-26T12:00:00Z")
    const events = [
      makeEvent({ id: "a", completedAt: "2026-08-24T09:00:00Z" }),
      makeEvent({ id: "b", completedAt: "2026-08-25T09:00:00Z" }),
      makeEvent({ id: "c", completedAt: "2026-08-26T09:00:00Z" }),
    ]
    const result = activitiesThisWeek(events, 2, now)
    expect(result.completed).toBe(3)
    expect(result.ratio).toBe(1)
  })

  it("computes a fractional ratio below the goal", () => {
    const now = new Date("2026-08-26T12:00:00Z")
    const events = [makeEvent({ id: "a", completedAt: "2026-08-24T09:00:00Z" })]
    const result = activitiesThisWeek(events, 4, now)
    expect(result.ratio).toBe(0.25)
  })

  it("returns a ratio of 0 when no weekly goal is set", () => {
    const now = new Date("2026-08-26T12:00:00Z")
    const events = [makeEvent({ completedAt: "2026-08-24T09:00:00Z" })]
    const result = activitiesThisWeek(events, 0, now)
    expect(result.ratio).toBe(0)
  })

  it("correctly separates weeks that straddle a year boundary", () => {
    // 2025-12-29 (Mon) is ISO week 1 of 2026; 2025-12-22 is ISO week 52 of 2025.
    const now = new Date("2025-12-30T12:00:00Z")
    const events = [
      makeEvent({ id: "a", completedAt: "2025-12-29T09:00:00Z" }),
      makeEvent({ id: "b", completedAt: "2025-12-22T09:00:00Z" }),
    ]
    const result = activitiesThisWeek(events, 5, now)
    expect(result.completed).toBe(1)
  })
})

describe("weeklyStreak", () => {
  it("returns N for N consecutive weeks meeting the goal", () => {
    const events = [
      makeEvent({ id: "w1a", completedAt: "2026-08-24T09:00:00Z" }),
      makeEvent({ id: "w1b", completedAt: "2026-08-25T09:00:00Z" }),
      makeEvent({ id: "w2a", completedAt: "2026-08-17T09:00:00Z" }),
      makeEvent({ id: "w2b", completedAt: "2026-08-18T09:00:00Z" }),
      makeEvent({ id: "w3a", completedAt: "2026-08-10T09:00:00Z" }),
      makeEvent({ id: "w3b", completedAt: "2026-08-11T09:00:00Z" }),
    ]
    expect(weeklyStreak(events, 2)).toBe(3)
  })

  it("breaks the streak on a week that misses the goal", () => {
    const events = [
      makeEvent({ id: "w1a", completedAt: "2026-08-24T09:00:00Z" }),
      makeEvent({ id: "w1b", completedAt: "2026-08-25T09:00:00Z" }),
      // week of 2026-08-17 only has 1 completed - misses goal of 2
      makeEvent({ id: "w2a", completedAt: "2026-08-17T09:00:00Z" }),
      // earlier weeks meet the goal again, but the streak already broke
      makeEvent({ id: "w3a", completedAt: "2026-08-10T09:00:00Z" }),
      makeEvent({ id: "w3b", completedAt: "2026-08-11T09:00:00Z" }),
    ]
    expect(weeklyStreak(events, 2)).toBe(1)
  })

  it("returns 0 when there are no completed events", () => {
    expect(weeklyStreak([], 2)).toBe(0)
  })

  it("returns 0 when weeklyGoal is not positive", () => {
    const events = [makeEvent({ completedAt: "2026-08-24T09:00:00Z" })]
    expect(weeklyStreak(events, 0)).toBe(0)
  })
})

describe("passportSummary", () => {
  it("totals categories, places, and activities correctly", () => {
    const events: MomentumActivityRecord[] = [
      makeEvent({ id: "a", completedAt: "2026-08-24T09:00:00Z", category: "sport", placeId: "place-1" }),
      makeEvent({ id: "b", completedAt: "2026-08-25T09:00:00Z", category: "sport", placeId: "place-2" }),
      makeEvent({ id: "c", completedAt: "2026-08-26T09:00:00Z", category: "food", placeId: "place-2" }),
      makeEvent({ id: "d", completedAt: null, category: "food", placeId: "place-3" }),
    ]
    const result = passportSummary(events)
    expect(result.totalActivities).toBe(3)
    expect(result.categoriesTried).toBe(2)
    expect(result.placesExplored).toBe(2)
  })

  it("computes level as 1 + floor(totalActivities / 5)", () => {
    const events: MomentumActivityRecord[] = Array.from({ length: 12 }, (_, i) =>
      makeEvent({ id: `e${i}`, completedAt: "2026-08-24T09:00:00Z" })
    )
    expect(passportSummary(events).level).toBe(1 + Math.floor(12 / 5))
  })

  it("defaults level to 1 with no completed activities", () => {
    expect(passportSummary([]).level).toBe(1)
  })
})
