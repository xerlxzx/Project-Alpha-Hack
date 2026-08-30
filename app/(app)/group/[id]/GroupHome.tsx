"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { CalendarClock, Loader2, MapPin, RotateCcw, Sparkles } from "lucide-react"

export interface GroupMember {
  userId: string
  firstName: string
  photoUrl: string | null
  isYou: boolean
}

export interface GroupActiveMeetup {
  id: string
  activityTitle: string | null
  venueName: string | null
  whenLabel: string | null
}

interface PlanResponse {
  error?: string
  meetupId?: string
}

export function GroupHome({
  groupId,
  activeMeetup,
}: {
  groupId: string
  activeMeetup: GroupActiveMeetup | null
}) {
  const router = useRouter()
  const [planning, setPlanning] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  async function organizeActivity() {
    setPlanning(true)
    setError(null)
    try {
      const response = await fetch(`/api/groups/${groupId}/plan`, { method: "POST" })
      const payload = (await response.json().catch(() => ({}))) as PlanResponse
      if (!response.ok || !payload.meetupId) {
        setError("Couldn't plan this week's activity. Please try again.")
        setPlanning(false)
        return
      }
      router.push(`/meetup/${payload.meetupId}`)
    } catch {
      setError("Network error. Please try again.")
      setPlanning(false)
    }
  }

  return (
    <section className="flex flex-col gap-4">
      <h2 className="font-display text-lg font-semibold text-foreground">This week</h2>

      {activeMeetup ? (
        <Link
          href={`/meetup/${activeMeetup.id}`}
          className="flex flex-col gap-2 rounded-2xl border border-accent/30 bg-accent/5 p-5 transition-colors hover:border-accent/50"
        >
          <span className="flex w-fit items-center gap-1.5 rounded-full bg-accent/10 px-2.5 py-0.5 text-xs font-semibold text-accent">
            <Sparkles className="size-3.5" aria-hidden />
            Planned
          </span>
          <span className="font-display text-lg font-semibold text-foreground">
            {activeMeetup.activityTitle ?? "Your next activity"}
          </span>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            {activeMeetup.whenLabel && (
              <span className="flex items-center gap-1.5">
                <CalendarClock className="size-4" aria-hidden />
                {activeMeetup.whenLabel}
              </span>
            )}
            {activeMeetup.venueName && (
              <span className="flex items-center gap-1.5">
                <MapPin className="size-4" aria-hidden />
                {activeMeetup.venueName}
              </span>
            )}
          </div>
        </Link>
      ) : (
        <div className="flex flex-col items-start gap-3 rounded-2xl border border-border bg-card p-5">
          <p className="text-sm text-muted-foreground">
            Ready when you are. Project Alpha will pick a real venue nearby for the group.
          </p>
          <button
            type="button"
            disabled={planning}
            onClick={organizeActivity}
            className="inline-flex min-h-11 items-center gap-2 rounded-full bg-accent px-5 text-sm font-semibold text-accent-foreground shadow-lg shadow-accent/25 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {planning ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Sparkles className="size-4" aria-hidden />
            )}
            {planning ? "Finding a place…" : "Organize this week's activity"}
          </button>
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-foreground"
        >
          <RotateCcw className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
          {error}
        </div>
      )}

      <Link href="/home" className="text-sm font-medium text-muted-foreground hover:text-foreground">
        Want something different instead? Find a new group →
      </Link>
    </section>
  )
}
