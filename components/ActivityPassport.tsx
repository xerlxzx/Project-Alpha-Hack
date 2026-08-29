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

/**
 * The Activity Passport stats from PRD 9.18. Flat premium surface, not
 * glass - DESIGN_DIRECTION.md reserves glass for chrome/hero surfaces only,
 * and this is a data-dense stat card. No amber here: every value stays on
 * the neutral foreground/muted-foreground tokens, since amber is reserved
 * for the ring/progress chrome (see MomentumRing).
 */
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
    </section>
  )
}
