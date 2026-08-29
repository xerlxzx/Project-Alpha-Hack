import { describe, expect, it } from "vitest"
import { MatchRequestSchema, requestedMeetupTime } from "@/lib/matcher/request"

describe("MatchRequestSchema", () => {
  it("accepts an empty request for the default match flow", () => {
    expect(MatchRequestSchema.safeParse({}).success).toBe(true)
  })

  it("accepts the home page controls and preserves the requested start time", () => {
    const result = MatchRequestSchema.safeParse({
      travelKm: 10,
      budgetAud: 25,
      socialEnergy: "medium",
      availability: [
        {
          startAt: "2026-08-29T09:00:00.000Z",
          endAt: "2026-08-29T11:00:00.000Z",
          mode: "im_free",
        },
      ],
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(requestedMeetupTime(result.data)).toBe("2026-08-29T09:00:00.000Z")
    }
  })

  it("rejects an availability window that ends before it starts", () => {
    const result = MatchRequestSchema.safeParse({
      availability: [
        {
          startAt: "2026-08-29T11:00:00.000Z",
          endAt: "2026-08-29T09:00:00.000Z",
          mode: "plan_ahead",
        },
      ],
    })

    expect(result.success).toBe(false)
  })

  it("rejects unknown request fields", () => {
    expect(MatchRequestSchema.safeParse({ userId: "spoofed-user" }).success).toBe(false)
  })
})
