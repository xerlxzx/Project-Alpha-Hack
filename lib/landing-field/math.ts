import type { Rect } from "./types"

export const CELL = 48
export const COUNTS = { wide: 96, narrow: 56 } as const

export function particleCountForWidth(width: number): number {
  return width >= 640 ? COUNTS.wide : COUNTS.narrow
}

export function hash2(ix: number, iy: number): number {
  let n = Math.imul(ix | 0, 374761393) + Math.imul(iy | 0, 668265263)
  n = Math.imul(n ^ (n >>> 13), 1274126177)
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296
}

function fade(t: number): number {
  return t * t * (3 - 2 * t)
}

export function valueNoise(x: number, y: number, t: number): number {
  const tx = x * 0.012 + t * 0.11
  const ty = y * 0.012 - t * 0.09
  const x0 = Math.floor(tx)
  const y0 = Math.floor(ty)
  const fx = fade(tx - x0)
  const fy = fade(ty - y0)
  const a = hash2(x0, y0)
  const b = hash2(x0 + 1, y0)
  const c = hash2(x0, y0 + 1)
  const d = hash2(x0 + 1, y0 + 1)
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy
}

export function flowAt(x: number, y: number, t: number): { fx: number; fy: number } {
  const e = 1.25
  const n1 = valueNoise(x, y + e, t)
  const n2 = valueNoise(x, y - e, t)
  const n3 = valueNoise(x + e, y, t)
  const n4 = valueNoise(x - e, y, t)
  return { fx: (n1 - n2) * 28, fy: (n4 - n3) * 28 }
}

export function roundedRectSdf(px: number, py: number, rect: Rect): number {
  const r = Math.min(rect.r ?? 12, rect.w / 2, rect.h / 2)
  const cx = rect.x + rect.w / 2
  const cy = rect.y + rect.h / 2
  const hx = rect.w / 2 - r
  const hy = rect.h / 2 - r
  const dx = Math.abs(px - cx) - hx
  const dy = Math.abs(py - cy) - hy
  const ox = Math.max(dx, 0)
  const oy = Math.max(dy, 0)
  return Math.hypot(ox, oy) + Math.min(Math.max(dx, dy), 0) - r
}

export function voidForce(px: number, py: number, voids: Rect[]): { fx: number; fy: number } {
  let fx = 0
  let fy = 0
  for (const rect of voids) {
    const d = roundedRectSdf(px, py, {
      ...rect,
      x: rect.x - 28,
      y: rect.y - 28,
      w: rect.w + 56,
      h: rect.h + 56,
    })
    if (d > 48) continue
    const e = 1.5
    let gx = roundedRectSdf(px + e, py, rect) - roundedRectSdf(px - e, py, rect)
    let gy = roundedRectSdf(px, py + e, rect) - roundedRectSdf(px, py - e, rect)
    let gl = Math.hypot(gx, gy)
    if (gl < 1e-4 && d < 0) {
      const cx = rect.x + rect.w / 2
      const cy = rect.y + rect.h / 2
      gx = px - cx
      gy = py - cy
      if (Math.abs(gx) < 1e-4 && Math.abs(gy) < 1e-4) {
        gx = 1
        gy = 0
      }
      gl = Math.hypot(gx, gy)
    }
    gl = gl || 1
    const strength = d < 0 ? 140 : (48 - d) * 1.6
    fx += (gx / gl) * strength
    fy += (gy / gl) * strength
  }
  return { fx, fy }
}

export function snapToGrid(x: number, y: number): { x: number; y: number } {
  return {
    x: Math.round(x / CELL) * CELL,
    y: Math.round(y / CELL) * CELL,
  }
}
