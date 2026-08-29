import { describe, expect, it } from "vitest"
import { sharedInterestsOf } from "@/lib/matcher/anonymize"

describe("sharedInterestsOf", () => {
  it("returns the intersection of interests+hobbies, deduplicated", () => {
    const activeUser = { interests: ["coffee", "music"], hobbies: ["hiking", "coffee"] }
    const candidate = { interests: ["coffee"], hobbies: ["climbing", "music"] }
    expect(sharedInterestsOf(activeUser, candidate)).toEqual(["coffee", "music"])
  })

  it("returns an empty array when nothing overlaps", () => {
    const activeUser = { interests: ["coffee"], hobbies: [] }
    const candidate = { interests: ["skydiving"], hobbies: [] }
    expect(sharedInterestsOf(activeUser, candidate)).toEqual([])
  })
})
