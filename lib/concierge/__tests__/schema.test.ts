import { describe, expect, it } from "vitest"
import { ConciergeIntentSchema, ConciergeSynthesisSchema } from "@/lib/concierge/schema"

function makeIntent(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    moodSummary: "low-energy, wants something calm",
    maxDurationMin: 90,
    groupSizeHint: 2,
    proposedActivity: "study",
    socialEnergy: "low",
    ...overrides,
  }
}

describe("ConciergeIntentSchema", () => {
  it("parses a valid intent", () => {
    expect(() => ConciergeIntentSchema.parse(makeIntent())).not.toThrow()
  })

  it("allows groupSizeHint, proposedActivity, and socialEnergy to be null", () => {
    const result = ConciergeIntentSchema.safeParse(
      makeIntent({ groupSizeHint: null, proposedActivity: null, socialEnergy: null })
    )
    expect(result.success).toBe(true)
  })

  it("rejects a groupSizeHint above 5", () => {
    const result = ConciergeIntentSchema.safeParse(makeIntent({ groupSizeHint: 6 }))
    expect(result.success).toBe(false)
  })

  it("rejects a non-positive maxDurationMin", () => {
    const result = ConciergeIntentSchema.safeParse(makeIntent({ maxDurationMin: 0 }))
    expect(result.success).toBe(false)
  })

  it("rejects a maxDurationMin above 240", () => {
    const result = ConciergeIntentSchema.safeParse(makeIntent({ maxDurationMin: 241 }))
    expect(result.success).toBe(false)
  })

  it("rejects an invalid socialEnergy value", () => {
    const result = ConciergeIntentSchema.safeParse(makeIntent({ socialEnergy: "extreme" }))
    expect(result.success).toBe(false)
  })
})

describe("ConciergeSynthesisSchema", () => {
  it("parses a valid explanation+opener pair", () => {
    const result = ConciergeSynthesisSchema.safeParse({
      explanation: "Two people nearby match on quiet study sessions.",
      opener: "Hey! Ready for a focused session?",
    })
    expect(result.success).toBe(true)
  })

  it("rejects a missing opener", () => {
    const result = ConciergeSynthesisSchema.safeParse({ explanation: "Some text." })
    expect(result.success).toBe(false)
  })
})
