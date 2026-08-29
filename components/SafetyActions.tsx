"use client"

import * as React from "react"
import { Flag, ShieldAlert, UserRoundX } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

export interface SafetyActionsProps {
  /** The participant being blocked / reported. Never a name — an id. */
  targetUserId: string
  /** Optional post-reveal first name (PRD §9.11) purely for the button labels. */
  targetLabel?: string
  /** Meetup this is happening in, attached to a report when present. */
  meetupId?: string
  className?: string
}

const REPORT_CATEGORIES = [
  "Harassment or bullying",
  "Inappropriate messages",
  "Made me feel unsafe",
  "No-show or repeated cancellation",
  "Spam or scam",
  "Other",
] as const

type SubmitState = "idle" | "submitting" | "done" | "error"

async function postJson(url: string, body: unknown): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    return res.ok
  } catch {
    return false
  }
}

function BlockAction({ targetUserId, who }: { targetUserId: string; who: string }) {
  const [state, setState] = React.useState<SubmitState>("idle")

  async function confirmBlock() {
    setState("submitting")
    const ok = await postJson("/api/blocks", { blocked: targetUserId })
    setState(ok ? "done" : "error")
  }

  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button variant="destructive" size="sm" className="justify-start">
            <UserRoundX data-icon="inline-start" aria-hidden />
            Block
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Block {who}?</DialogTitle>
          <DialogDescription>
            You won&apos;t be matched together again, and they won&apos;t be able to see or message you.
            They aren&apos;t told they&apos;ve been blocked.
          </DialogDescription>
        </DialogHeader>

        {state === "done" ? (
          <p className="text-sm font-medium text-foreground">{who} has been blocked.</p>
        ) : state === "error" ? (
          <p className="text-sm font-medium text-destructive">
            Couldn&apos;t block right now — please try again.
          </p>
        ) : null}

        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>
            {state === "done" ? "Close" : "Cancel"}
          </DialogClose>
          {state !== "done" && (
            <Button variant="destructive" onClick={confirmBlock} disabled={state === "submitting"}>
              {state === "submitting" ? "Blocking…" : `Block ${who}`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ReportAction({
  targetUserId,
  meetupId,
  who,
}: {
  targetUserId: string
  meetupId?: string
  who: string
}) {
  const [category, setCategory] = React.useState<string>(REPORT_CATEGORIES[0])
  const [detail, setDetail] = React.useState("")
  const [state, setState] = React.useState<SubmitState>("idle")

  async function submitReport() {
    setState("submitting")
    const ok = await postJson("/api/reports", {
      reported: targetUserId,
      category,
      detail: detail.trim() || undefined,
      meetupId,
    })
    setState(ok ? "done" : "error")
  }

  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm" className="justify-start">
            <Flag data-icon="inline-start" aria-hidden />
            Report
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Report {who}</DialogTitle>
          <DialogDescription>
            Reports are private. One report never automatically penalises anyone — the safety team
            reviews patterns. You won&apos;t see the outcome.
          </DialogDescription>
        </DialogHeader>

        {state === "done" ? (
          <p className="text-sm font-medium text-foreground">
            Thanks — your report has been sent to the safety team.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              Reason
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
              >
                {REPORT_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1.5 text-sm font-medium">
              Anything else? <span className="font-normal text-muted-foreground">(optional)</span>
              <textarea
                value={detail}
                onChange={(e) => setDetail(e.target.value)}
                rows={3}
                maxLength={2000}
                placeholder="What happened?"
                className="w-full resize-y rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
              />
            </label>

            {state === "error" && (
              <p className="text-sm font-medium text-destructive">
                Couldn&apos;t send the report — please try again.
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>
            {state === "done" ? "Close" : "Cancel"}
          </DialogClose>
          {state !== "done" && (
            <Button onClick={submitReport} disabled={state === "submitting"}>
              {state === "submitting" ? "Sending…" : "Send report"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// UI stub only (per the 6.3 dispatch): "share activity + check-in status with
// a trusted contact". No backend — there's no trusted-contacts table, and the
// PRD marks this optional. Captures a contact locally and shows a confirmed
// state so the safety story is demoable end to end.
function TrustedContactAction() {
  const [name, setName] = React.useState("")
  const [shared, setShared] = React.useState(false)

  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm" className="justify-start">
            <ShieldAlert data-icon="inline-start" aria-hidden />
            Trusted contact
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Share with a trusted contact</DialogTitle>
          <DialogDescription>
            They&apos;ll get the activity, venue and time, and your check-in status once the meetup
            starts. Your check-in stays private to them.
          </DialogDescription>
        </DialogHeader>

        {shared ? (
          <p className="text-sm font-medium text-foreground">
            {name.trim() || "Your contact"} will be kept in the loop for this meetup.
          </p>
        ) : (
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Contact name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Sam (flatmate)"
              className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
            />
          </label>
        )}

        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>{shared ? "Close" : "Cancel"}</DialogClose>
          {!shared && (
            <Button onClick={() => setShared(true)} disabled={!name.trim()}>
              Share
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Safety controls for a co-participant — block, report, and loop in a trusted
 * contact (PRD §9.16, §10). Flat surface (a control cluster, not chrome); the
 * dialogs it opens carry the shared glass treatment. Never renders report
 * history — that's never shown to participants.
 */
export function SafetyActions({ targetUserId, targetLabel, meetupId, className }: SafetyActionsProps) {
  const who = targetLabel?.trim() || "this person"

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <p className="text-xs font-medium text-muted-foreground">Safety</p>
      <div className="flex flex-wrap gap-2">
        <BlockAction targetUserId={targetUserId} who={who} />
        <ReportAction targetUserId={targetUserId} meetupId={meetupId} who={who} />
        <TrustedContactAction />
      </div>
    </div>
  )
}
