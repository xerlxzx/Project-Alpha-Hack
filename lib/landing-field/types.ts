export type Rect = { x: number; y: number; w: number; h: number; r?: number }

export type FieldEvent =
  | { type: "pointer"; x: number; y: number; active: boolean }
  | { type: "focus"; rect: Rect | null }
  | { type: "typing"; at: number }
  | { type: "mode"; mode: "signin" | "signup"; at: number }
  | { type: "demoHover"; on: boolean }

export type Particle = {
  x: number
  y: number
  vx: number
  vy: number
  size: number
  tint: number
}

export type MatchGroup = {
  ids: number[]
  venueX: number
  venueY: number
  phase: "seeking" | "locked" | "dissolving"
  age: number
  lockDuration: number
}

export type FieldState = {
  width: number
  height: number
  time: number
  particles: Particle[]
  groups: MatchGroup[]
  voids: Rect[]
  pointer: { x: number; y: number; active: boolean }
  focus: Rect | null
  demoHover: boolean
  lastModeBurstAt: number
  lastTypeAt: number
  seed: number
}
