"use client"

import * as React from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { Check, CircleDashed, Loader2 } from "lucide-react"

import { cn } from "@/lib/utils"
import { GlassPanel } from "@/components/GlassPanel"
import { ease, spring } from "@/components/motion/tokens"

export interface AgentStep {
  key: string
  label: string
  status: "pending" | "active" | "done"
  detail?: string
}

export interface MapPin {
  placeId: string
  lat: number
  lng: number
  label?: string
  selected?: boolean
}

export interface AgentProgressProps {
  /** Five venue-agent states from analysis through selection. */
  steps: AgentStep[]
  /** Dropped in as they arrive from the live route data. */
  pins: MapPin[]
  center: { lat: number; lng: number }
  /** Area radius (km) the projection frames around `center`. */
  boundsKm?: number
  className?: string
}

const KM_PER_DEG_LAT = 111.32

/**
 * Projects real venue coordinates onto a 0-100% stylized map frame.
 * `boundsKm` sets the radius around `center`.
 */
function projectToPercent(
  point: { lat: number; lng: number },
  center: { lat: number; lng: number },
  boundsKm: number
) {
  const kmPerDegLng = KM_PER_DEG_LAT * Math.cos((center.lat * Math.PI) / 180)
  const dxKm = (point.lng - center.lng) * kmPerDegLng
  const dyKm = (point.lat - center.lat) * KM_PER_DEG_LAT

  const xPct = 50 + (dxKm / boundsKm) * 50
  const yPct = 50 - (dyKm / boundsKm) * 50 // screen y grows downward, lat grows upward

  return {
    x: Math.min(96, Math.max(4, xPct)),
    y: Math.min(96, Math.max(4, yPct)),
  }
}

export interface ScatterPoint {
  x: number
  y: number
  delay: number
}

/**
 * A deterministic scatter of decorative "candidate" points around the map
 * centre. Seeded so positions stay stable across re-renders; these are
 * cosmetic (the abstract search animation), distinct from the real venue
 * coordinates projected by projectToPercent.
 */
function candidateScatter(count: number): ScatterPoint[] {
  let seed = 0x811c9dc5
  const rand = () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return Array.from({ length: count }, () => {
    const angle = rand() * Math.PI * 2
    const radius = 10 + rand() * 34 // % of the frame out from the centre
    return {
      x: Math.min(94, Math.max(6, 50 + Math.cos(angle) * radius)),
      y: Math.min(94, Math.max(6, 50 + Math.sin(angle) * radius * 0.8)),
      delay: rand() * 0.8,
    }
  })
}

/** Concentric range rings around the group's area. */
function RangeRings({ reduce }: { reduce: boolean }) {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
    >
      {[0, 1, 2].map((i) => {
        const size = 96 + i * 92
        return (
          <motion.span
            key={i}
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-accent/20"
            style={{ width: size, height: size }}
            animate={reduce ? undefined : { opacity: [0.15, 0.4, 0.15], scale: [0.98, 1.03, 0.98] }}
            transition={
              reduce ? undefined : { duration: 3.2, repeat: Infinity, delay: i * 0.5, ease: "easeInOut" }
            }
          />
        )
      })}
    </div>
  )
}

/** Slow radar sweep emanating from the centre while the agent searches. */
function RadarSweep() {
  return (
    <motion.div
      aria-hidden
      className="pointer-events-none absolute left-1/2 top-1/2 size-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full"
      style={{
        background:
          "conic-gradient(from 0deg, transparent 0deg, color-mix(in oklab, var(--accent) 26%, transparent) 34deg, transparent 62deg)",
        WebkitMaskImage: "radial-gradient(circle, #000 28%, transparent 70%)",
        maskImage: "radial-gradient(circle, #000 28%, transparent 70%)",
      }}
      initial={{ rotate: 0, opacity: 0 }}
      animate={{ rotate: 360, opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{
        rotate: { duration: 4.5, repeat: Infinity, ease: "linear" },
        opacity: { duration: 0.6 },
      }}
    />
  )
}

/** Faint candidate points pinging around the centre during the search. */
function CandidateField({ points, reduce }: { points: ScatterPoint[]; reduce: boolean }) {
  return (
    <motion.div
      aria-hidden
      className="pointer-events-none absolute inset-0"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.5 } }}
    >
      {points.map((p, i) => (
        <motion.span
          key={i}
          className="absolute size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground/45"
          style={{ left: `${p.x}%`, top: `${p.y}%` }}
          initial={reduce ? { opacity: 0.45 } : { opacity: 0, scale: 0 }}
          animate={reduce ? { opacity: 0.45 } : { opacity: [0, 0.6, 0.3], scale: [0, 1.15, 1] }}
          transition={
            reduce
              ? { duration: 0.2 }
              : {
                  duration: 1.6,
                  delay: p.delay,
                  repeat: Infinity,
                  repeatType: "reverse",
                  repeatDelay: 0.6,
                }
          }
        />
      ))}
    </motion.div>
  )
}

function StepIcon({ status, reduce }: { status: AgentStep["status"]; reduce: boolean }) {
  if (status === "done") {
    return (
      <span className="grid size-6 shrink-0 place-items-center rounded-full bg-accent text-accent-foreground">
        <Check className="size-3.5" strokeWidth={3} />
      </span>
    )
  }
  if (status === "active") {
    return (
      <span className="grid size-6 shrink-0 place-items-center rounded-full border border-accent/40 text-accent">
        <Loader2 className={cn("size-4", !reduce && "motion-safe:animate-spin")} />
      </span>
    )
  }
  return (
    <span className="grid size-6 shrink-0 place-items-center rounded-full text-muted-foreground/60">
      <CircleDashed className="size-4" />
    </span>
  )
}

function MapPinMarker({
  pin,
  center,
  boundsKm,
  reduce,
}: {
  pin: MapPin
  center: { lat: number; lng: number }
  boundsKm: number
  reduce: boolean
}) {
  const { x, y } = projectToPercent(pin, center, boundsKm)

  return (
    <motion.div
      className="absolute z-20 -translate-x-1/2 -translate-y-full"
      style={{ left: `${x}%`, top: `${y}%` }}
      initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.3, y: -14 }}
      animate={reduce ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
      transition={reduce ? { duration: 0.15 } : spring.bouncy}
    >
      <div className="flex flex-col items-center">
        {pin.label && (
          <span
            className={cn(
              "mb-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-medium shadow-sm",
              pin.selected
                ? "bg-accent text-accent-foreground"
                : "bg-surface/90 text-foreground"
            )}
          >
            {pin.label}
          </span>
        )}
        <span
          aria-hidden
          className={cn(
            "block rounded-full border-2 border-white shadow-md dark:border-white/80",
            pin.selected ? "size-4 bg-accent" : "size-2.5 bg-foreground/70"
          )}
        />
      </div>
    </motion.div>
  )
}

/**
 * Shows projected venue coordinates beside the live agent steps.
 */
export function AgentProgress({
  steps,
  pins,
  center,
  boundsKm = 5,
  className,
}: AgentProgressProps) {
  const prefersReducedMotion = useReducedMotion()
  const reduce = Boolean(prefersReducedMotion)

  const gridLines = React.useMemo(() => Array.from({ length: 5 }, (_, i) => (i + 1) * (100 / 6)), [])

  // The winning venue pin arrives when the agent finishes; until then the
  // panel is "searching" and shows the abstract sweep + candidate field.
  const resolved = pins.some((p) => p.selected)
  const searching = !resolved
  const scatter = React.useMemo(() => candidateScatter(20), [])

  return (
    <div className={cn("flex flex-col gap-4 md:flex-row", className)}>
      {/* Stylized map backdrop */}
      <div
        className="relative h-56 w-full overflow-hidden rounded-2xl border border-border bg-muted sm:h-72 md:h-80 md:flex-1"
        role="img"
        aria-label="Map of candidate venue locations"
      >
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(circle at 30% 20%, color-mix(in oklab, var(--accent) 10%, transparent), transparent 60%), radial-gradient(circle at 80% 80%, color-mix(in oklab, var(--accent) 8%, transparent), transparent 55%)",
          }}
        />
        <svg aria-hidden className="absolute inset-0 h-full w-full opacity-40 dark:opacity-25">
          {gridLines.map((pct) => (
            <line
              key={`v-${pct}`}
              x1={`${pct}%`}
              y1="0"
              x2={`${pct}%`}
              y2="100%"
              className="stroke-border"
              strokeWidth={1}
            />
          ))}
          {gridLines.map((pct) => (
            <line
              key={`h-${pct}`}
              x1="0"
              y1={`${pct}%`}
              x2="100%"
              y2={`${pct}%`}
              className="stroke-border"
              strokeWidth={1}
            />
          ))}
        </svg>

        {/* Concentric range rings around the group's area. */}
        <RangeRings reduce={reduce} />

        {/* Abstract search animation: radar sweep + candidate points, both
            present while the agent searches and gone once a venue is chosen. */}
        <AnimatePresence>
          {searching && !reduce && <RadarSweep key="sweep" />}
        </AnimatePresence>
        <AnimatePresence>
          {searching && <CandidateField key="candidates" points={scatter} reduce={reduce} />}
        </AnimatePresence>

        {/* Center marker for the group's area. */}
        <span
          aria-hidden
          className="absolute left-1/2 top-1/2 z-10 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground/60"
        />

        <AnimatePresence>
          {pins.map((pin) => (
            <MapPinMarker key={pin.placeId} pin={pin} center={center} boundsKm={boundsKm} reduce={reduce} />
          ))}
        </AnimatePresence>
      </div>

      {/* One of the four sanctioned GlassPanel surfaces. */}
      <GlassPanel withTextBacking className="w-full p-4 md:w-72 md:shrink-0">
        <ol className="flex flex-col gap-3">
          {steps.map((step) => (
            <motion.li
              key={step.key}
              className="flex items-start gap-3"
              initial={reduce ? { opacity: 0 } : { opacity: 0, x: -8 }}
              animate={reduce ? { opacity: 1 } : { opacity: 1, x: 0 }}
              transition={reduce ? { duration: 0.15 } : { ...spring.gentle, ease: ease.out }}
            >
              <StepIcon status={step.status} reduce={reduce} />
              <div className="min-w-0 flex-1 pt-0.5">
                <p
                  className={cn(
                    "text-sm font-medium",
                    step.status === "pending" ? "text-muted-foreground" : "text-foreground"
                  )}
                >
                  {step.label}
                </p>
                {step.detail && <p className="mt-0.5 truncate text-xs text-muted-foreground">{step.detail}</p>}
              </div>
            </motion.li>
          ))}
        </ol>
      </GlassPanel>
    </div>
  )
}
