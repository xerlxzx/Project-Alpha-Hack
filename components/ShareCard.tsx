"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

export interface ShareCardProps {
  completed: number
  goal: number
  streak: number
  className?: string
}

/**
 * The shareable Momentum recap (PRD 9.18): "2/2 plans completed. Four-week
 * Momentum streak." Deliberately shows only aggregate numbers - no
 * participant names, photos, venue names, or addresses are ever passed
 * into this component, so identities and exact locations are hidden by
 * construction rather than filtered out at render time.
 *
 * "Share" here is a copy-to-clipboard affordance, not a real share-sheet
 * integration - sufficient for a preview per the brief.
 */
export function ShareCard({ completed, goal, streak, className }: ShareCardProps) {
  const [copied, setCopied] = React.useState(false)

  const recapText = `${completed}/${goal} plans completed. ${streak}-week Momentum streak.`

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(recapText)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard access can be denied or unavailable - the card is still a
      // valid preview without it, so failing silently is fine here.
    }
  }

  return (
    <section
      className={cn(
        "flex flex-col items-center gap-3 rounded-2xl border border-border bg-card p-6 text-center text-card-foreground",
        className
      )}
      aria-label="Shareable Momentum recap"
    >
      <p className="font-display text-xl text-foreground">Momentum</p>
      <p className="text-base text-foreground">{recapText}</p>
      <p className="text-xs text-muted-foreground">
        Recap only - no names, photos, or locations shown.
      </p>
      <button
        type="button"
        onClick={handleCopy}
        className="mt-1 rounded-full border border-border px-4 py-1.5 text-sm font-medium text-foreground hover:bg-muted"
      >
        {copied ? "Copied" : "Copy recap"}
      </button>
    </section>
  )
}
