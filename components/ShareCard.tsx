"use client"

import * as React from "react"

import { GlassPanel } from "@/components/GlassPanel"
import { cn } from "@/lib/utils"

export interface ShareCardProps {
  completed: number
  goal: number
  streak: number
  className?: string
}

/**
 * Shareable Project Alpha recap with aggregate numbers only. The component accepts
 * no participant or venue details.
 * "Share" copies the recap to the clipboard for this preview.
 */
export function ShareCard({ completed, goal, streak, className }: ShareCardProps) {
  const [copied, setCopied] = React.useState(false)

  const recapText = `${completed}/${goal} plans completed. ${streak}-week Project Alpha streak.`

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(recapText)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Keep the preview usable when clipboard access fails.
    }
  }

  return (
    <GlassPanel
      role="region"
      withTextBacking
      backingClassName="bg-surface/60 dark:bg-surface/40"
      className={cn("flex flex-col items-center gap-3 p-6 text-center", className)}
      aria-label="Shareable Project Alpha recap"
    >
      <p className="font-display text-xl text-foreground">Project Alpha</p>
      <p className="text-base text-foreground">{recapText}</p>
      <p className="text-xs text-muted-foreground">
        Recap only, with no names, photos, or locations shown.
      </p>
      <button
        type="button"
        onClick={handleCopy}
        className="mt-1 rounded-full border border-border px-4 py-1.5 text-sm font-medium text-foreground hover:bg-muted"
      >
        {copied ? "Copied" : "Copy recap"}
      </button>
    </GlassPanel>
  )
}
