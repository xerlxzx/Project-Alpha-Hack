import { describe, expect, it, vi } from "vitest"
import { interpretIntent, ConciergeIntentError, type IntentDeps } from "@/lib/concierge/intent"

function makeDeps(overrides: Partial<IntentDeps> = {}): IntentDeps {
  return {
    generate: vi.fn().mockResolvedValue({
      moodSummary: "tired, wants something low-key",
      maxDurationMin: 90,
      groupSizeHint: 2,
      proposedActivity: "study",
      socialEnergy: "low",
    }),
    ...overrides,
  }
}

describe("interpretIntent", () => {
  it("returns a validated intent from the generate dependency", async () => {
    const deps = makeDeps()
    const intent = await interpretIntent("I'm tired, have 90 minutes, want to meet two people", deps)
    expect(intent.maxDurationMin).toBe(90)
    expect(intent.groupSizeHint).toBe(2)
    expect(deps.generate).toHaveBeenCalledTimes(1)
  })

  it("retries once on failure before succeeding", async () => {
    const generate = vi
      .fn()
      .mockRejectedValueOnce(new Error("transient"))
      .mockResolvedValueOnce({
        moodSummary: "calm",
        maxDurationMin: 60,
        groupSizeHint: null,
        proposedActivity: null,
        socialEnergy: null,
      })
    const intent = await interpretIntent("something", { generate })
    expect(intent.maxDurationMin).toBe(60)
    expect(generate).toHaveBeenCalledTimes(2)
  })

  it("throws ConciergeIntentError after two consecutive failures", async () => {
    const generate = vi.fn().mockRejectedValue(new Error("down"))
    await expect(interpretIntent("something", { generate })).rejects.toBeInstanceOf(ConciergeIntentError)
    expect(generate).toHaveBeenCalledTimes(2)
  })

  it("throws ConciergeIntentError when the generated output fails schema validation", async () => {
    const generate = vi.fn().mockResolvedValue({ moodSummary: "ok" }) // missing required fields
    await expect(interpretIntent("something", { generate })).rejects.toBeInstanceOf(ConciergeIntentError)
  })
})
