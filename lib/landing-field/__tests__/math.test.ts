import { describe, expect, it } from "vitest"
import {
  CELL,
  hash2,
  particleCountForWidth,
  roundedRectSdf,
  snapToGrid,
  voidForce,
  flowAt,
} from "@/lib/landing-field"

describe("particleCountForWidth", () => {
  it("uses 96 at 640px and above, 56 below", () => {
    expect(particleCountForWidth(640)).toBe(96)
    expect(particleCountForWidth(1280)).toBe(96)
    expect(particleCountForWidth(639)).toBe(56)
  })
})

describe("hash2", () => {
  it("returns a deterministic value in [0, 1)", () => {
    const a = hash2(3, 7)
    expect(a).toBeGreaterThanOrEqual(0)
    expect(a).toBeLessThan(1)
    expect(hash2(3, 7)).toBe(a)
    expect(hash2(3, 8)).not.toBe(a)
  })
})

describe("roundedRectSdf", () => {
  const rect = { x: 100, y: 80, w: 200, h: 120, r: 16 }

  it("is negative at the centre (inside)", () => {
    expect(roundedRectSdf(200, 140, rect)).toBeLessThan(0)
  })

  it("is positive well outside", () => {
    expect(roundedRectSdf(10, 10, rect)).toBeGreaterThan(20)
  })
})

describe("voidForce", () => {
  const voids = [{ x: 100, y: 100, w: 200, h: 80, r: 12 }]

  it("pushes a point at the rect centre away from the centre", () => {
    const f = voidForce(200, 140, voids)
    const mag = Math.hypot(f.fx, f.fy)
    expect(mag).toBeGreaterThan(40)
  })

  it("is near zero far from every void", () => {
    const f = voidForce(800, 600, voids)
    expect(Math.hypot(f.fx, f.fy)).toBeLessThan(0.5)
  })
})

describe("snapToGrid", () => {
  it("snaps to CELL intersections", () => {
    const p = snapToGrid(70, 90)
    expect(p.x % CELL).toBe(0)
    expect(p.y % CELL).toBe(0)
  })
})

describe("flowAt", () => {
  it("returns finite curl and is not identically zero", () => {
    const a = flowAt(120, 80, 1.5)
    const b = flowAt(400, 300, 4)
    expect(Number.isFinite(a.fx) && Number.isFinite(a.fy)).toBe(true)
    expect(Math.hypot(a.fx, a.fy) + Math.hypot(b.fx, b.fy)).toBeGreaterThan(0)
  })
})
