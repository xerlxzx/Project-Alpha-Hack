"use client"

import * as React from "react"
import { motion, useReducedMotion } from "framer-motion"

import { cn } from "@/lib/utils"

export interface MomentumRingProps {
  /** Activities completed this week. */
  completed: number
  /** The user's weekly goal. */
  goal: number
  /** Ring diameter in px. */
  size?: number
  /** Small caption under the ring, e.g. "This week". */
  label?: string
  /** Consecutive weeks meeting the goal - renders the streak row when set. */
  streak?: number
  /** Earned activity badge names/codes - rendered as chips below the ring. */
  badges?: string[]
  className?: string
}

/** Apple Activity-style closing ring for weekly momentum progress. */
export function MomentumRing({
  completed,
  goal,
  size = 160,
  label,
  streak,
  badges,
  className,
}: MomentumRingProps) {
  const prefersReducedMotion = useReducedMotion()
  const ratio = goal > 0 ? Math.min(completed / goal, 1) : 0

  const strokeWidth = Math.max(8, Math.round(size * 0.08))
  const radius = size / 2 - strokeWidth / 2
  const circumference = 2 * Math.PI * radius
  const center = size / 2

  return (
    <div className={cn("flex flex-col items-center gap-3", className)}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={`${completed} of ${goal} activities completed this week`}
      >
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          className="stroke-border"
        />
        <motion.circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          className="stroke-accent"
          transform={`rotate(-90 ${center} ${center})`}
          style={{ strokeDasharray: circumference }}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: circumference * (1 - ratio) }}
          transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.8, ease: "easeOut" }}
        />
        <text
          x={center}
          y={center}
          textAnchor="middle"
          dominantBaseline="central"
          className="fill-foreground font-sans text-lg font-semibold"
        >
          {completed}/{goal}
        </text>
      </svg>

      {label && <p className="text-sm text-muted-foreground">{label}</p>}

      {((streak !== undefined && streak > 0) || (badges && badges.length > 0)) && (
        <div className="flex flex-col items-center gap-2">
          {streak !== undefined && streak > 0 && (
            <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
              <span aria-hidden className="inline-block size-2 rounded-full bg-accent" />
              {streak} week{streak === 1 ? "" : "s"} streak
            </p>
          )}
          {badges && badges.length > 0 && (
            <div className="flex flex-wrap justify-center gap-1.5">
              {badges.map((badge) => (
                <span
                  key={badge}
                  className="rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs text-muted-foreground"
                >
                  {badge}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
