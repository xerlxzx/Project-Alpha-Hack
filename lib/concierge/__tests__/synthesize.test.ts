import { describe, expect, it, vi } from "vitest"
import { synthesizeExplanation, type SynthesisDeps, type SynthesisFacts } from "@/lib/concierge/synthesize"

function makeFacts(overrides: Partial<SynthesisFacts> = {}): SynthesisFacts {
  return {
    groupSize: 3,
    sharedInterestReasons: ["You share several interests and hobbies"],
    venueName: "Fisher Library",
    distanceKm: 1.2,
    maxDurationMin: 90,
    activityTitle: "Quiet study sprint",
    ...overrides,
  }
}

describe("synthesizeExplanation", () => {
  it("returns the validated Gemini output when the call succeeds", async () => {
    const deps: SynthesisDeps = {
      generate: vi.fn().mockResolvedValue({
        explanation: "Two people nearby match on quiet study sessions.",
        opener: "Hey! Ready for a focused session?",
      }),
    }
    const result = await synthesizeExplanation(makeFacts(), deps)
    expect(result.explanation).toContain("Two people nearby")
    expect(result.opener).toContain("Hey!")
  })

  it("falls back to a template when the Gemini call throws", async () => {
    const deps: SynthesisDeps = { generate: vi.fn().mockRejectedValue(new Error("down")) }
    const result = await synthesizeExplanation(makeFacts(), deps)
    expect(result.explanation).toContain("Fisher Library")
    expect(result.explanation).toContain("90")
    expect(result.opener.length).toBeGreaterThan(0)
  })

  it("falls back to a template when the Gemini output fails schema validation", async () => {
    const deps: SynthesisDeps = { generate: vi.fn().mockResolvedValue({ explanation: "only half the shape" }) }
    const result = await synthesizeExplanation(makeFacts(), deps)
    expect(result.opener.length).toBeGreaterThan(0)
  })

  it("template fallback never names individual people, only a count", () => {
    return synthesizeExplanation(makeFacts({ groupSize: 3 }), {
      generate: vi.fn().mockRejectedValue(new Error("down")),
    }).then((result) => {
      expect(result.explanation).toContain("2")
      expect(result.explanation).not.toMatch(/[A-Z][a-z]+ and [A-Z][a-z]+/)
    })
  })
})
