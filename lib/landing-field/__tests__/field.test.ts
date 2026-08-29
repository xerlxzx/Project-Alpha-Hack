import { describe, expect, it } from "vitest"
import {
  applyEvent,
  createField,
  resizeField,
  setVoids,
  stepField,
} from "@/lib/landing-field"

describe("createField", () => {
  it("spawns 96 particles on a wide canvas and at least one seeking group", () => {
    const field = createField(1280, 800, 1)
    expect(field.particles).toHaveLength(96)
    expect(field.groups.some((g) => g.phase === "seeking" || g.phase === "locked")).toBe(
      true,
    )
    expect(field.groups[0].ids.length).toBeGreaterThanOrEqual(3)
    expect(field.groups[0].ids.length).toBeLessThanOrEqual(4)
  })

  it("spawns 56 particles on a narrow canvas", () => {
    expect(createField(390, 800, 1).particles).toHaveLength(56)
  })
})

describe("stepField", () => {
  it("does not move particles when reducedMotion is true", () => {
    const field = createField(800, 600, 2)
    const before = field.particles.map((p) => ({ x: p.x, y: p.y }))
    stepField(field, 0.16, true)
    field.particles.forEach((p, i) => {
      expect(p.x).toBe(before[i].x)
      expect(p.y).toBe(before[i].y)
    })
  })

  it("advances time and keeps at least one live group after several seconds", () => {
    const field = createField(800, 600, 3)
    for (let i = 0; i < 240; i++) stepField(field, 1 / 60, false)
    expect(field.time).toBeGreaterThan(3)
    expect(field.groups.some((g) => g.phase === "seeking" || g.phase === "locked")).toBe(
      true,
    )
  })

  it("keeps particles out of a void after stepping", () => {
    const field = createField(800, 600, 4)
    setVoids(field, [{ x: 200, y: 200, w: 240, h: 160, r: 16 }])
    for (let i = 0; i < 180; i++) stepField(field, 1 / 60, false)
    for (const p of field.particles) {
      const inside = p.x > 210 && p.x < 430 && p.y > 210 && p.y < 350
      expect(inside).toBe(false)
    }
  })
})

describe("applyEvent", () => {
  it("stores pointer, focus, demo hover, and mode burst time", () => {
    const field = createField(800, 600, 5)
    applyEvent(field, { type: "pointer", x: 10, y: 20, active: true })
    expect(field.pointer).toEqual({ x: 10, y: 20, active: true })
    applyEvent(field, { type: "focus", rect: { x: 1, y: 2, w: 3, h: 4 } })
    expect(field.focus).toEqual({ x: 1, y: 2, w: 3, h: 4 })
    applyEvent(field, { type: "demoHover", on: true })
    expect(field.demoHover).toBe(true)
    applyEvent(field, { type: "mode", mode: "signup", at: 9 })
    expect(field.lastModeBurstAt).toBe(9)
    applyEvent(field, { type: "typing", at: 11 })
    expect(field.lastTypeAt).toBe(11)
  })
})

describe("resizeField", () => {
  it("rebuilds particle count when crossing the 640px threshold", () => {
    const field = createField(800, 600, 6)
    resizeField(field, 400, 700)
    expect(field.particles).toHaveLength(56)
    expect(field.width).toBe(400)
    expect(field.height).toBe(700)
  })
})
