import Link from "next/link"

import { cn } from "@/lib/utils"

export interface ActivityPassportProps {
  thisWeek: { completed: number; goal: number }
  streak: number
  totalHours?: number | null
  categoriesTried: number
  placesExplored: number
  totalActivities: number
  level: number
  badges?: string[]
  className?: string
}

export function ActivityPassport({
  thisWeek,
  streak,
  totalHours,
  categoriesTried,
  placesExplored,
  totalActivities,
  level,
  badges,
  className,
}: ActivityPassportProps) {
  const privilegesUnlocked = level >= 2
  const activitiesUntilUnlock = Math.max(0, 5 - totalActivities)
  const stats: { label: string; value: string }[] = [
    { label: "This week", value: `${thisWeek.completed}/${thisWeek.goal}` },
    { label: "Weekly streak", value: `${streak} week${streak === 1 ? "" : "s"}` },
    { label: "Activities tried", value: String(totalActivities) },
    { label: "Categories tried", value: String(categoriesTried) },
    { label: "Places explored", value: String(placesExplored) },
    { label: "Level", value: String(level) },
  ]

  if (totalHours) {
    stats.splice(2, 0, { label: "Hours spent", value: totalHours.toFixed(1) })
  }

  return (
    <section
      className={cn("rounded-2xl border border-border bg-card p-6 text-card-foreground", className)}
      aria-label="Activity Passport"
    >
      <h2 className="font-display text-lg text-foreground">Activity Passport</h2>

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-4">
        {stats.map((stat) => (
          <div key={stat.label}>
            <dt className="text-xs text-muted-foreground">{stat.label}</dt>
            <dd className="text-base font-semibold text-foreground">{stat.value}</dd>
          </div>
        ))}
      </dl>

      {badges && badges.length > 0 && (
        <div className="mt-5 border-t border-border pt-4">
          <p className="text-xs text-muted-foreground">Earned badges</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {badges.map((badge) => (
              <span
                key={badge}
                className="rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs text-muted-foreground"
              >
                {badge}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="mt-5 border-t border-border pt-4">
        <h3 className="text-sm font-semibold text-foreground">Level privileges</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Complete activities to unlock more ways to explore.
        </p>

        <div className="mt-3 space-y-2">
          <div className="rounded-xl border border-border bg-background p-3.5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-foreground">Host an activity</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {privilegesUnlocked
                    ? "Create and host your own public meetup."
                    : `Locked until level 2 — ${activitiesUntilUnlock} ${
                        activitiesUntilUnlock === 1 ? "activity" : "activities"
                      } to go.`}
                </p>
              </div>
              <span className="shrink-0 text-xs font-medium text-muted-foreground">
                {privilegesUnlocked ? "Unlocked" : "Locked"}
              </span>
            </div>
            {privilegesUnlocked && (
              <Link
                href="/meetups/create"
                className="mt-3 inline-flex min-h-10 items-center justify-center rounded-full bg-amber-500 px-4 text-sm font-semibold text-stone-950 transition-colors hover:bg-amber-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 dark:ring-offset-background"
              >
                Host an activity
              </Link>
            )}
          </div>

          <div className="rounded-xl border border-border bg-background p-3.5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-foreground">
                  Adventurous recommendations
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {privilegesUnlocked
                    ? "Unlocked — your suggestions can now stretch beyond familiar picks."
                    : `Locked until level 2 — complete ${activitiesUntilUnlock} more ${
                        activitiesUntilUnlock === 1 ? "activity" : "activities"
                      }.`}
                </p>
              </div>
              <span className="shrink-0 text-xs font-medium text-muted-foreground">
                {privilegesUnlocked ? "Unlocked" : "Locked"}
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
