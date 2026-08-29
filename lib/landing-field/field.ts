import {
  CELL,
  flowAt,
  hash2,
  particleCountForWidth,
  roundedRectSdf,
  snapToGrid,
  voidForce,
} from "./math"
import type { FieldEvent, FieldState, MatchGroup, Particle, Rect } from "./types"

function spawnParticles(width: number, height: number, seed: number): Particle[] {
  const count = particleCountForWidth(width)
  const inset = 24
  const particles: Particle[] = []
  for (let i = 0; i < count; i++) {
    particles.push({
      x: inset + hash2(seed, i) * (width - inset * 2),
      y: inset + hash2(i, seed) * (height - inset * 2),
      vx: 0,
      vy: 0,
      size: 1.6 + hash2(i, 9) * 1.4,
      tint: hash2(i, 3),
    })
  }
  return particles
}

function idsInLiveGroups(groups: MatchGroup[]): Set<number> {
  const used = new Set<number>()
  for (const group of groups) {
    if (group.phase === "seeking" || group.phase === "locked") {
      for (const id of group.ids) used.add(id)
    }
  }
  return used
}

function liveGroupCount(groups: MatchGroup[]): number {
  return groups.filter((g) => g.phase === "seeking" || g.phase === "locked").length
}

const VENUE_VOID_CLEARANCE = 80

function isValidVenue(x: number, y: number, voids: Rect[]): boolean {
  for (const rect of voids) {
    const cx = rect.x + rect.w / 2
    const cy = rect.y + rect.h / 2
    if (Math.hypot(x - cx, y - cy) < VENUE_VOID_CLEARANCE) return false
    if (roundedRectSdf(x, y, rect) < 0) return false
  }
  return true
}

function findFallbackVenue(state: FieldState): { x: number; y: number } {
  const inset = CELL
  for (let gy = inset; gy <= state.height - inset; gy += CELL) {
    for (let gx = inset; gx <= state.width - inset; gx += CELL) {
      if (isValidVenue(gx, gy, state.voids)) return { x: gx, y: gy }
    }
  }
  for (let gy = 0; gy <= state.height; gy += CELL) {
    for (let gx = 0; gx <= state.width; gx += CELL) {
      if (isValidVenue(gx, gy, state.voids)) return { x: gx, y: gy }
    }
  }
  return snapToGrid(state.width / 2, state.height / 2)
}

function pickVenue(state: FieldState, attempt: number): { x: number; y: number } {
  for (let t = 0; t < 8; t++) {
    const vx = 80 + hash2(state.seed + t, attempt) * (state.width - 160)
    const vy = 80 + hash2(attempt, state.seed + t) * (state.height - 160)
    const snapped = snapToGrid(vx, vy)
    if (isValidVenue(snapped.x, snapped.y, state.voids)) return snapped
  }
  return findFallbackVenue(state)
}

function revalidateLiveVenues(state: FieldState): void {
  for (let i = 0; i < state.groups.length; i++) {
    const group = state.groups[i]
    if (group.phase !== "seeking" && group.phase !== "locked") continue
    if (!isValidVenue(group.venueX, group.venueY, state.voids)) {
      const venue = pickVenue(state, i)
      group.venueX = venue.x
      group.venueY = venue.y
    }
  }
}

function spawnGroup(state: FieldState, attempt: number): boolean {
  const used = idsInLiveGroups(state.groups)
  const count = hash2(state.seed, state.groups.length + attempt) > 0.5 ? 4 : 3
  const ids: number[] = []
  for (let i = 0; i < state.particles.length && ids.length < count; i++) {
    const idx =
      (i + Math.floor(hash2(state.seed, i + attempt * 7) * state.particles.length)) %
      state.particles.length
    if (!used.has(idx) && !ids.includes(idx)) ids.push(idx)
  }
  if (ids.length < 3) return false

  const venue = pickVenue(state, attempt)
  state.groups.push({
    ids,
    venueX: venue.x,
    venueY: venue.y,
    phase: "seeking",
    age: 0,
    lockDuration: 2.8,
  })
  return true
}

function ensureLiveGroup(state: FieldState, minCount = 1): void {
  let guard = 0
  while (liveGroupCount(state.groups) < minCount && guard < 4) {
    if (!spawnGroup(state, guard)) break
    guard++
  }
}

function meanDistanceToVenue(group: MatchGroup, particles: Particle[]): number {
  let total = 0
  for (const id of group.ids) {
    const p = particles[id]
    total += Math.hypot(p.x - group.venueX, p.y - group.venueY)
  }
  return total / group.ids.length
}

function demoTarget(state: FieldState): { x: number; y: number } {
  if (state.voids.length > 0) {
    let lowest = state.voids[0]
    let lowestBottom = lowest.y + lowest.h
    for (const rect of state.voids) {
      const bottom = rect.y + rect.h
      if (bottom > lowestBottom) {
        lowest = rect
        lowestBottom = bottom
      }
    }
    return { x: lowest.x + lowest.w / 2, y: lowestBottom }
  }
  return { x: state.width / 2, y: state.height - 48 }
}

function findGroupForParticle(state: FieldState, index: number): MatchGroup | null {
  for (const group of state.groups) {
    if (
      (group.phase === "seeking" || group.phase === "locked") &&
      group.ids.includes(index)
    ) {
      return group
    }
  }
  return null
}

export function createField(width: number, height: number, seed = 1): FieldState {
  const state: FieldState = {
    width,
    height,
    time: 0,
    particles: spawnParticles(width, height, seed),
    groups: [],
    voids: [],
    pointer: { x: 0, y: 0, active: false },
    focus: null,
    demoHover: false,
    lastModeBurstAt: -99,
    lastTypeAt: -99,
    seed,
  }
  ensureLiveGroup(state)
  return state
}

export function resizeField(state: FieldState, width: number, height: number): void {
  const prevCount = particleCountForWidth(state.width)
  state.width = width
  state.height = height
  if (particleCountForWidth(width) !== prevCount) {
    state.particles = spawnParticles(width, height, state.seed)
    state.groups = []
    ensureLiveGroup(state)
  }
}

export function setVoids(state: FieldState, voids: Rect[]): void {
  state.voids = [...voids]
  revalidateLiveVenues(state)
}

export function applyEvent(state: FieldState, event: FieldEvent): void {
  switch (event.type) {
    case "pointer":
      state.pointer = { x: event.x, y: event.y, active: event.active }
      break
    case "focus":
      state.focus = event.rect
      break
    case "typing":
      state.lastTypeAt = event.at
      break
    case "mode":
      state.lastModeBurstAt = event.at
      break
    case "demoHover":
      state.demoHover = event.on
      break
  }
}

export function stepField(state: FieldState, dt: number, reducedMotion: boolean): void {
  if (reducedMotion) return

  dt = Math.min(dt, 1 / 30)
  state.time += dt

  const demoIds = state.groups[0]?.ids ?? [0, 1, 2, 3]
  const demoCentre = demoTarget(state)
  const diamondOffsets = [
    [0, -16],
    [16, 0],
    [0, 16],
    [-16, 0],
  ]

  for (let i = 0; i < state.particles.length; i++) {
    const p = state.particles[i]
    let ax = 0
    let ay = 0

    const flow = flowAt(p.x, p.y, state.time)
    ax += flow.fx
    ay += flow.fy

    const vf = voidForce(p.x, p.y, state.voids)
    ax += vf.fx
    ay += vf.fy

    if (state.pointer.active) {
      const dx = state.pointer.x - p.x
      const dy = state.pointer.y - p.y
      const dist = Math.hypot(dx, dy)
      const falloff = 1 / (1 + dist / 140)
      const accel = 38 * falloff
      if (dist > 0) {
        ax += (dx / dist) * accel
        ay += (dy / dist) * accel
      }
    }

    if (state.focus) {
      const cx = state.focus.x + state.focus.w / 2
      const cy = state.focus.y + state.focus.h / 2
      const dx = p.x - cx
      const dy = p.y - cy
      const dist = Math.hypot(dx, dy)
      if (dist < 160 && dist > 0) {
        const strength = 22 * (1 - dist / 160)
        ax += (-dy / dist) * strength
        ay += (dx / dist) * strength
      }
    }

    if (state.time - state.lastTypeAt < 0.18) {
      let tcx: number | undefined
      let tcy: number | undefined
      if (state.focus) {
        tcx = state.focus.x + state.focus.w / 2
        tcy = state.focus.y + state.focus.h / 2
      } else if (state.pointer.active) {
        tcx = state.pointer.x
        tcy = state.pointer.y
      }
      if (tcx !== undefined && tcy !== undefined) {
        const dx = p.x - tcx
        const dy = p.y - tcy
        if (Math.hypot(dx, dy) < 120) {
          ax += (hash2(Math.floor(p.x), Math.floor(state.time * 100)) - 0.5) * 36
          ay += (hash2(Math.floor(p.y), Math.floor(state.time * 100 + 1)) - 0.5) * 36
        }
      }
    }

    const burstAge = state.time - state.lastModeBurstAt
    if (burstAge < 0.45) {
      const cx = state.width / 2
      const cy = state.height / 2
      const dx = p.x - cx
      const dy = p.y - cy
      const dist = Math.hypot(dx, dy) || 1
      const decay = 1 - burstAge / 0.45
      const strength = 55 * decay
      ax += (dx / dist) * strength
      ay += (dy / dist) * strength
    }

    const group = findGroupForParticle(state, i)
    if (group) {
      if (group.phase === "seeking") {
        const dx = group.venueX - p.x
        const dy = group.venueY - p.y
        const dist = Math.hypot(dx, dy)
        if (dist > 0) {
          ax += (dx / dist) * 42
          ay += (dy / dist) * 42
        }
      } else if (group.phase === "locked") {
        const dx = p.x - group.venueX
        const dy = p.y - group.venueY
        const dist = Math.hypot(dx, dy) || 1
        const ring = 10
        const diff = dist - ring
        ax -= (dx / dist) * diff * 10
        ay -= (dy / dist) * diff * 10
        ax += (-dy / dist) * 4
        ay += (dx / dist) * 4
      }
    }

    if (state.demoHover && demoIds.includes(i)) {
      const slot = demoIds.indexOf(i)
      const [ox, oy] = diamondOffsets[slot % 4]
      const tx = demoCentre.x + ox
      const ty = demoCentre.y + oy
      ax += (tx - p.x) * 0.2
      ay += (ty - p.y) * 0.2
    }

    p.vx = (p.vx + ax * dt) * 0.92
    p.vy = (p.vy + ay * dt) * 0.92
    p.x += p.vx * dt
    p.y += p.vy * dt

    if (p.x < -8) p.x += state.width + 16
    if (p.x > state.width + 8) p.x -= state.width + 16
    if (p.y < -8) p.y += state.height + 16
    if (p.y > state.height + 8) p.y -= state.height + 16

    for (const rect of state.voids) {
      const d = roundedRectSdf(p.x, p.y, rect)
      if (d < 0) {
        const cx = rect.x + rect.w / 2
        const cy = rect.y + rect.h / 2
        let dx = p.x - cx
        let dy = p.y - cy
        if (Math.hypot(dx, dy) < 1e-4) {
          dx = 1
          dy = 0
        }
        const dist = Math.hypot(dx, dy) || 1
        const push = -d + 6
        p.x += (dx / dist) * push
        p.y += (dy / dist) * push
      }
    }
  }

  for (const group of state.groups) {
    if (group.phase === "seeking") {
      group.age += dt
      if (group.age > 2.4 || meanDistanceToVenue(group, state.particles) < 22) {
        group.phase = "locked"
        group.age = 0
        group.lockDuration = 2.8
      }
    } else if (group.phase === "locked") {
      group.age += dt
      if (group.age > group.lockDuration * 0.55 && liveGroupCount(state.groups) < 2) {
        ensureLiveGroup(state, 2)
      }
      if (group.age > group.lockDuration) {
        group.phase = "dissolving"
        group.age = 0
      }
    } else if (group.phase === "dissolving") {
      group.age += dt
    }
  }

  state.groups = state.groups.filter(
    (g) => g.phase !== "dissolving" || g.age <= 1.1,
  )
  ensureLiveGroup(state)
}
