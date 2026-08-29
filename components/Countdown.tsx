"use client"

import * as React from "react"
import { motion, useReducedMotion } from "framer-motion"
import { CalendarPlus, CheckCircle2, Lock } from "lucide-react"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

// Local spring config matching PrimaryCTA's transition.
const snappySpring = { type: "spring", stiffness: 320, damping: 24 } as const

function LockInButton({
  children,
  ...props
}: React.ComponentProps<typeof motion.button>) {
  const reduce = useReducedMotion()
  return (
    <motion.button
      className="inline-flex items-center justify-center gap-2 rounded-full bg-accent px-7 py-3.5 text-base font-semibold text-accent-foreground shadow-lg shadow-accent/25 outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      whileHover={reduce ? undefined : { y: -2 }}
      whileTap={reduce ? undefined : { scale: 0.96, y: 0 }}
      transition={snappySpring}
      {...props}
    >
      {children}
    </motion.button>
  )
}

function remaining(targetMs: number) {
  const diff = Math.max(0, targetMs - Date.now())
  const totalSeconds = Math.floor(diff / 1000)
  return {
    days: Math.floor(totalSeconds / 86400),
    hours: Math.floor((totalSeconds % 86400) / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
    done: diff <= 0,
  }
}

/** Live countdown to `targetIso`. Ticks every second; stops at zero. */
export function Countdown({ targetIso }: { targetIso: string }) {
  const targetMs = React.useMemo(() => new Date(targetIso).getTime(), [targetIso])
  const [time, setTime] = React.useState(() => remaining(targetMs))
  const reduce = useReducedMotion()

  React.useEffect(() => {
    const id = setInterval(() => setTime(remaining(targetMs)), 1000)
    return () => clearInterval(id)
  }, [targetMs])

  if (time.done) {
    return (
      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
        <CheckCircle2 className="size-4 text-success" aria-hidden />
        Happening now
      </div>
    )
  }

  const units: Array<[string, number]> = [
    ["days", time.days],
    ["hrs", time.hours],
    ["min", time.minutes],
    ["sec", time.seconds],
  ]

  return (
    <div className="flex items-center gap-3" role="timer" aria-live="off">
      {units.map(([label, value]) => (
        <div key={label} className="flex flex-col items-center">
          <motion.span
            key={`${label}-${value}`}
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={snappySpring}
            className="font-display text-2xl font-semibold tabular-nums text-foreground"
          >
            {String(value).padStart(2, "0")}
          </motion.span>
          <span className="text-[0.65rem] uppercase tracking-wide text-muted-foreground">
            {label}
          </span>
        </div>
      ))}
    </div>
  )
}

function pad(n: number) {
  return String(n).padStart(2, "0")
}

/** `YYYYMMDDTHHMMSSZ`, the UTC form ICS expects. */
function toIcsUtc(date: Date) {
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
  )
}

function escapeIcsText(text: string) {
  return text.replace(/\\/g, "\\\\").replace(/,/g, "\\,").replace(/;/g, "\\;").replace(/\n/g, "\\n")
}

function buildIcsContent({
  uid,
  title,
  location,
  description,
  start,
  durationHours = 2,
}: {
  uid: string
  title: string
  location: string
  description: string
  start: Date
  durationHours?: number
}) {
  const end = new Date(start.getTime() + durationHours * 60 * 60 * 1000)
  const now = new Date()

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Project Alpha//Meetup//EN",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${uid}@project-alpha.app`,
    `DTSTAMP:${toIcsUtc(now)}`,
    `DTSTART:${toIcsUtc(start)}`,
    `DTEND:${toIcsUtc(end)}`,
    `SUMMARY:${escapeIcsText(title)}`,
    `LOCATION:${escapeIcsText(location)}`,
    `DESCRIPTION:${escapeIcsText(description)}`,
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n")
}

function downloadIcs(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/calendar;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}

export interface LockMeInProps {
  meetupId: string
  activityTitle: string
  venueName: string
  /** ISO timestamp of the meetup, or null if not yet scheduled. */
  scheduledAt: string | null
}

/**
 * Explicit "Lock me in" confirmation, followed by a countdown and calendar
 * export action. Cancellation affordance is present but inert in this build.
 */
export function LockMeIn({ meetupId, activityTitle, venueName, scheduledAt }: LockMeInProps) {
  const [locked, setLocked] = React.useState(false)

  if (!scheduledAt) {
    return (
      <p className="text-sm text-muted-foreground">
        This meetup doesn&apos;t have a scheduled time yet.
      </p>
    )
  }

  if (!locked) {
    return (
      <div className="flex flex-col items-start gap-3 rounded-2xl bg-card p-5 ring-1 ring-foreground/10">
        <p className="text-sm text-muted-foreground">
          Confirming you&apos;re coming starts your countdown and adds the calendar invite.
        </p>
        <LockInButton onClick={() => setLocked(true)}>
          <Lock className="size-4" aria-hidden />
          Lock me in
        </LockInButton>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 rounded-2xl bg-card p-5 ring-1 ring-foreground/10">
      <div className="flex items-center gap-2 text-sm font-medium text-success">
        <CheckCircle2 className="size-4" aria-hidden />
        You&apos;re locked in
      </div>

      <Countdown targetIso={scheduledAt} />

      <div className="flex flex-wrap gap-2 pt-1">
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            downloadIcs(
              `${activityTitle.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.ics`,
              buildIcsContent({
                uid: meetupId,
                title: activityTitle,
                location: venueName,
                description: `Project Alpha meetup: ${activityTitle} at ${venueName}.`,
                start: new Date(scheduledAt),
              })
            )
          }
        >
          <CalendarPlus data-icon="inline-start" aria-hidden />
          Add to calendar
        </Button>

        <CancelStub />
      </div>
    </div>
  )
}

function CancelStub() {
  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button variant="ghost" size="sm" className={cn("text-muted-foreground")} />
        }
      >
        Can&apos;t make it?
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancelling</DialogTitle>
          <DialogDescription>
            Cancellation is consequence-free before the cutoff, and affects your private
            reliability score after it. That logic isn&apos;t wired up in this build yet, so
            for now this is a placeholder.
          </DialogDescription>
        </DialogHeader>
      </DialogContent>
    </Dialog>
  )
}
