"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Loader2, RotateCcw, Shuffle, Sparkles, UsersRound } from "lucide-react"

import { FeedbackBurst } from "@/components/motion/FeedbackBurst"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"

export interface ContinueMember {
  userId: string
  firstName: string
  photoUrl: string | null
}

interface ContinueResponse {
  error?: string
  staying?: boolean
  groupId?: string | null
  groupConfirmed?: boolean
  votesFor?: number
}

export function ContinueDecision({
  meetupId,
  members,
  initialVote,
  initialGroupId,
}: {
  meetupId: string
  members: ContinueMember[]
  initialVote: boolean | null
  initialGroupId: string | null
}) {
  const router = useRouter()
  const [submitting, setSubmitting] = React.useState<"stay" | "leave" | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [result, setResult] = React.useState<ContinueResponse | null>(
    initialVote === null ? null : { staying: initialVote, groupId: initialGroupId, groupConfirmed: initialGroupId !== null }
  )
  const [showBurst, setShowBurst] = React.useState(false)

  async function decide(stay: boolean) {
    setSubmitting(stay ? "stay" : "leave")
    setError(null)
    try {
      const response = await fetch(`/api/meetups/${meetupId}/continue`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stay }),
      })
      const payload = (await response.json().catch(() => ({}))) as ContinueResponse
      if (!response.ok) {
        setError("That didn't save. Please try again.")
        setSubmitting(null)
        return
      }
      setResult(payload)
      if (stay && payload.groupConfirmed) {
        setShowBurst(true)
      }
    } catch {
      setError("Network error. Please try again.")
      setSubmitting(null)
    }
  }

  if (result) {
    return (
      <>
        <ResultPanel
          result={result}
          members={members}
          onFindNewGroup={() => router.push("/home")}
          onSeeGroup={() => result.groupId && router.push(`/group/${result.groupId}`)}
        />
        {showBurst && (
          <div className="fixed inset-0 z-50 bg-background/95" role="status" aria-live="polite">
            <FeedbackBurst
              show
              message="Group confirmed"
              detail="Your weekly activity is on its way."
              onDone={() => setShowBurst(false)}
            />
          </div>
        )}
      </>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {members.length > 0 && (
        <div className="flex items-center gap-2">
          <div className="flex -space-x-2">
            {members.slice(0, 4).map((member) => (
              <Avatar key={member.userId} className="ring-2 ring-background">
                <AvatarImage src={member.photoUrl ?? undefined} alt="" />
                <AvatarFallback>{member.firstName.slice(0, 1)}</AvatarFallback>
              </Avatar>
            ))}
          </div>
          <p className="text-sm text-muted-foreground">
            With {members.map((m) => m.firstName).join(", ")}
          </p>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          disabled={submitting !== null}
          onClick={() => decide(true)}
          className={cn(
            "flex flex-col items-start gap-2 rounded-2xl border border-border bg-card p-5 text-left transition-colors hover:border-accent/50 disabled:cursor-not-allowed disabled:opacity-60"
          )}
        >
          <span className="grid size-10 place-items-center rounded-full bg-accent/10 text-accent">
            <UsersRound className="size-5" aria-hidden />
          </span>
          <span className="font-display text-lg font-semibold text-foreground">Keep this group</span>
          <span className="text-sm text-muted-foreground">
            Get a new recommended activity together each week.
          </span>
          {submitting === "stay" && (
            <Loader2 className="mt-1 size-4 animate-spin text-accent" aria-hidden />
          )}
        </button>

        <button
          type="button"
          disabled={submitting !== null}
          onClick={() => decide(false)}
          className={cn(
            "flex flex-col items-start gap-2 rounded-2xl border border-border bg-card p-5 text-left transition-colors hover:border-foreground/25 disabled:cursor-not-allowed disabled:opacity-60"
          )}
        >
          <span className="grid size-10 place-items-center rounded-full bg-muted text-muted-foreground">
            <Shuffle className="size-5" aria-hidden />
          </span>
          <span className="font-display text-lg font-semibold text-foreground">
            Meet someone new
          </span>
          <span className="text-sm text-muted-foreground">
            Get matched into a fresh group next time instead.
          </span>
          {submitting === "leave" && (
            <Loader2 className="mt-1 size-4 animate-spin text-muted-foreground" aria-hidden />
          )}
        </button>
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
    </div>
  )
}

function ResultPanel({
  result,
  members,
  onFindNewGroup,
  onSeeGroup,
}: {
  result: ContinueResponse
  members: ContinueMember[]
  onFindNewGroup: () => void
  onSeeGroup: () => void
}) {
  if (result.staying && result.groupConfirmed) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-2xl border border-accent/30 bg-accent/5 p-6 text-center">
        <span className="grid size-12 place-items-center rounded-full bg-accent/10 text-accent">
          <Sparkles className="size-6" aria-hidden />
        </span>
        <div>
          <h2 className="font-display text-xl font-semibold text-foreground">
            Your group is confirmed
          </h2>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            {members.length > 0
              ? `Enough of you want to keep meeting with ${members.map((m) => m.firstName).join(" & ")}.`
              : "Enough of you want to keep meeting."}{" "}
            Project Alpha will suggest something new each week.
          </p>
        </div>
        <button
          type="button"
          onClick={onSeeGroup}
          className="inline-flex min-h-11 items-center rounded-full bg-accent px-5 text-sm font-semibold text-accent-foreground shadow-lg shadow-accent/25"
        >
          See your group
        </button>
      </div>
    )
  }

  if (result.staying && !result.groupConfirmed) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-2xl border border-border bg-card p-6 text-center">
        <span className="grid size-12 place-items-center rounded-full bg-muted text-muted-foreground">
          <UsersRound className="size-6" aria-hidden />
        </span>
        <div>
          <h2 className="font-display text-xl font-semibold text-foreground">You&apos;re in</h2>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            We&apos;ll confirm the group once one more person agrees to keep meeting.
          </p>
        </div>
        <button
          type="button"
          onClick={onFindNewGroup}
          className="inline-flex min-h-11 items-center rounded-full border border-border px-5 text-sm font-medium text-foreground/80"
        >
          Back home
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-4 rounded-2xl border border-border bg-card p-6 text-center">
      <span className="grid size-12 place-items-center rounded-full bg-muted text-muted-foreground">
        <Shuffle className="size-6" aria-hidden />
      </span>
      <div>
        <h2 className="font-display text-xl font-semibold text-foreground">Noted</h2>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          We&apos;ll match you into a new group next time you&apos;re free.
        </p>
      </div>
      <button
        type="button"
        onClick={onFindNewGroup}
        className="inline-flex min-h-11 items-center rounded-full bg-accent px-5 text-sm font-semibold text-accent-foreground shadow-lg shadow-accent/25"
      >
        Find a new group
      </button>
    </div>
  )
}
