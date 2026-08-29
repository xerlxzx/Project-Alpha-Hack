"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Heart, Loader2, RotateCcw, Sparkles, UserRoundCheck, UserRoundX } from "lucide-react"

import { FeedbackBurst } from "@/components/motion/FeedbackBurst"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"

export interface FeedbackMember {
  userId: string
  firstName: string
  photoUrl: string | null
}

interface PersonSignal {
  meetAgain: boolean
  avoidRematch: boolean
}

interface FeedbackResponse {
  error?: string
  detail?: string
  derivedSignal?: { tags: string[]; sentiment: "positive" | "neutral" | "negative" } | null
  interpretationWarning?: string | null
  preferenceUpdated?: boolean
  reconnectedWith?: string[]
}

const REACTIONS = [
  { value: "great_group", label: "Great energy", symbol: "✦" },
  { value: "easy_energy", label: "Felt easy", symbol: "☺" },
  { value: "not_for_me", label: "Not my fit", symbol: "○" },
] as const

export function FeedbackForm({
  meetupId,
  members,
}: {
  meetupId: string
  members: FeedbackMember[]
}) {
  const router = useRouter()
  const [reaction, setReaction] = React.useState<string | null>(null)
  const [signals, setSignals] = React.useState<Record<string, PersonSignal>>({})
  const [note, setNote] = React.useState("")
  const [submitting, setSubmitting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [success, setSuccess] = React.useState<{ message: string; detail: string } | null>(null)

  function updateSignal(userId: string, choice: keyof PersonSignal) {
    setSignals((current) => {
      const previous = current[userId] ?? { meetAgain: false, avoidRematch: false }
      const nextValue = !previous[choice]
      return {
        ...current,
        [userId]: {
          meetAgain: choice === "meetAgain" ? nextValue : false,
          avoidRematch: choice === "avoidRematch" ? nextValue : false,
        },
      }
    })
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setSubmitting(true)
    setError(null)

    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          meetupId,
          groupReaction: reaction,
          note,
          people: members.map((member) => ({
            userId: member.userId,
            meetAgain: signals[member.userId]?.meetAgain ?? false,
            avoidRematch: signals[member.userId]?.avoidRematch ?? false,
          })),
        }),
      })
      const payload = (await response.json().catch(() => ({}))) as FeedbackResponse
      if (!response.ok) {
        setError(
          payload.detail === "preference_signal_failed"
            ? "We couldn’t interpret your note. Try again, or submit without it."
            : "Your feedback didn’t save. Please try again."
        )
        setSubmitting(false)
        return
      }

      const names = payload.reconnectedWith ?? []
      const tags = payload.derivedSignal?.tags ?? []
      setSuccess({
        message: names.length > 0 ? `Reconnected with ${names.join(" & ")}` : "Project Alpha updated",
        detail:
          payload.interpretationWarning
            ? "Feedback saved. Your private note can be interpreted later."
            : tags.length > 0
            ? `Future matches now know: ${tags.slice(0, 3).join(", ")}`
            : "Your activity is now part of this week’s progress.",
      })
    } catch {
      setError("Network error. Please try again.")
      setSubmitting(false)
    }
  }

  function finishSuccess() {
    router.push("/profile")
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="flex flex-col gap-7">
        <fieldset className="flex flex-col gap-3">
          <legend className="font-display text-lg font-semibold text-foreground">
            How did the group feel?
          </legend>
          <p className="text-sm text-muted-foreground">One tap. Kept private.</p>
          <div className="grid grid-cols-3 gap-2 pt-1">
            {REACTIONS.map((option) => {
              const selected = reaction === option.value
              return (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setReaction(selected ? null : option.value)}
                  className={cn(
                    "flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-2xl border bg-card px-2 py-3 text-center text-xs font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-foreground/30",
                    selected
                      ? "border-foreground/30 bg-secondary text-foreground"
                      : "border-border text-muted-foreground hover:border-foreground/20 hover:text-foreground"
                  )}
                >
                  <span className="font-display text-2xl text-foreground" aria-hidden>
                    {option.symbol}
                  </span>
                  {option.label}
                </button>
              )
            })}
          </div>
        </fieldset>

        <fieldset className="flex flex-col gap-3">
          <legend className="font-display text-lg font-semibold text-foreground">
            Anyone you’d meet again?
          </legend>
          <p className="text-sm text-muted-foreground">
            These choices stay between you and Project Alpha.
          </p>
          <div className="flex flex-col gap-2 pt-1">
            {members.map((member) => {
              const signal = signals[member.userId] ?? {
                meetAgain: false,
                avoidRematch: false,
              }
              return (
                <div
                  key={member.userId}
                  className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-3 sm:flex-row sm:items-center"
                >
                  <div className="flex min-w-0 items-center gap-3 sm:mr-auto">
                    <Avatar>
                      <AvatarImage src={member.photoUrl ?? undefined} alt="" />
                      <AvatarFallback>{member.firstName.slice(0, 1)}</AvatarFallback>
                    </Avatar>
                    <span className="truncate text-sm font-semibold text-foreground">
                      {member.firstName}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      aria-pressed={signal.meetAgain}
                      onClick={() => updateSignal(member.userId, "meetAgain")}
                      className={cn(
                        "inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border px-3 text-xs font-semibold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-foreground/30",
                        signal.meetAgain
                          ? "border-foreground/30 bg-secondary text-foreground"
                          : "border-border text-muted-foreground hover:text-foreground"
                      )}
                    >
                      <UserRoundCheck className="size-4" aria-hidden />
                      Meet again
                    </button>
                    <button
                      type="button"
                      aria-pressed={signal.avoidRematch}
                      onClick={() => updateSignal(member.userId, "avoidRematch")}
                      className={cn(
                        "inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border px-3 text-xs font-semibold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-destructive",
                        signal.avoidRematch
                          ? "border-destructive/60 bg-destructive/10 text-foreground"
                          : "border-border text-muted-foreground hover:text-foreground"
                      )}
                    >
                      <UserRoundX className="size-4" aria-hidden />
                      Avoid
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </fieldset>

        <div className="flex flex-col gap-2">
          <label htmlFor="feedback-note" className="font-display text-lg font-semibold text-foreground">
            Anything to remember?
          </label>
          <p id="feedback-note-help" className="text-sm text-muted-foreground">
            Optional. AI turns this private note into better future matches.
          </p>
          <textarea
            id="feedback-note"
            aria-describedby="feedback-note-help"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            maxLength={500}
            rows={3}
            placeholder="More low-key outdoor plans like this…"
            className="resize-none rounded-2xl border border-border bg-card px-4 py-3 text-base text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-foreground/30 focus-visible:ring-2 focus-visible:ring-foreground/20"
          />
          <span className="self-end text-xs tabular-nums text-muted-foreground">{note.length}/500</span>
        </div>

        {error && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-foreground"
          >
            <RotateCcw className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-accent px-6 text-base font-semibold text-accent-foreground shadow-lg shadow-accent/25 transition-transform motion-safe:hover:-translate-y-0.5 motion-safe:active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? (
            <Loader2 className="size-4 motion-safe:animate-spin" aria-hidden />
          ) : (
            <Heart className="size-4" aria-hidden />
          )}
          {submitting ? "Saving your feedback…" : "Finish & update Project Alpha"}
        </button>

        <p className="flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
          <Sparkles className="size-3.5" aria-hidden />
          Private signals only — never public ratings.
        </p>
      </form>

      {success && (
        <div className="fixed inset-0 z-50 bg-background/95" role="status" aria-live="polite">
          <FeedbackBurst
            show
            message={success.message}
            detail={success.detail}
            onDone={finishSuccess}
          />
        </div>
      )}
    </>
  )
}
