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
      className="absolute -translate-x-1/2 -translate-y-full"
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

        {/* Center marker for the group's area. */}
        <span
          aria-hidden
          className="absolute left-1/2 top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground/40"
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
