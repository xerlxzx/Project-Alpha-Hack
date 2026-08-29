"use client"

import * as React from "react"
import { FastForward } from "lucide-react"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"

export function DemoTimeSkip({ meetupId }: { meetupId: string }) {
  const router = useRouter()
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  async function skipToOutcome() {
    if (busy) return
    setBusy(true)
    setError(null)

    try {
      const response = await fetch("/api/demo/time-skip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meetupId }),
      })

      if (!response.ok) {
        setError("Demo skip failed. Try again.")
        return
      }

      router.refresh()
    } catch {
      setError("Demo skip failed. Try again.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <Button variant="outline" size="sm" onClick={skipToOutcome} disabled={busy}>
        <FastForward className="size-4" aria-hidden />
        {busy ? "Skipping demo…" : "Demo: skip to feedback"}
      </Button>
      {error && (
        <p className="text-xs font-medium text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
