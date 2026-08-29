"use client"

import * as React from "react"
import { ChevronDown, Flag, Shield, ShieldAlert, UserRoundX } from "lucide-react"

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
  /** Participant ID to block or report. Never pass a name. */
  targetUserId: string
  /** Optional first name used in button labels. */
  targetLabel?: string
  /** Meetup this is happening in, attached to a report when present. */
  meetupId?: string
  /** Render the meetup-wide trusted-contact action alongside member actions. */
  showTrustedContact?: boolean
  /** Show the small "Safety" label above the actions. */
  showLabel?: boolean
  className?: string
}

export interface SafetyMember {
  userId: string
  firstName: string
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
            Couldn&apos;t block right now, please try again.
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
            Reports are private, and one report never penalises anyone on its own, since the
            safety team reviews patterns. You won&apos;t see the outcome.
          </DialogDescription>
        </DialogHeader>

        {state === "done" ? (
          <p className="text-sm font-medium text-foreground">
            Thanks, your report has been sent to the safety team.
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
                Couldn&apos;t send the report, please try again.
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

// UI stub: shares activity + check-in status with a trusted contact.
// Captures a contact locally and shows a confirmed state; no backend yet.
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

/** Block, report, and trusted-contact controls for a co-participant. */
export function SafetyActions({
  targetUserId,
  targetLabel,
  meetupId,
  showTrustedContact = true,
  showLabel = true,
  className,
}: SafetyActionsProps) {
  const who = targetLabel?.trim() || "this person"

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {showLabel && (
        <p className="text-xs font-medium text-muted-foreground">Safety</p>
      )}
      <div className="flex flex-wrap gap-2">
        <BlockAction targetUserId={targetUserId} who={who} />
        <ReportAction targetUserId={targetUserId} meetupId={meetupId} who={who} />
        {showTrustedContact && <TrustedContactAction />}
      </div>
    </div>
  )
}

const SELECT_CLASS =
  "h-12 w-full appearance-none rounded-lg border border-input bg-transparent px-3.5 pr-10 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"

/** Header icon that opens safety controls for co-participants. */
export function MeetupSafety({
  members,
  meetupId,
}: {
  members: SafetyMember[]
  meetupId: string
}) {
  const rootRef = React.useRef<HTMLDivElement>(null)
  const [open, setOpen] = React.useState(false)
  const [selectedId, setSelectedId] = React.useState(members[0]?.userId ?? "")
  const selected = members.find((member) => member.userId === selectedId) ?? members[0]

  React.useEffect(() => {
    if (!open) return

    function isInsideDialog(target: EventTarget | null) {
      return target instanceof Element
        ? Boolean(target.closest("[data-slot='dialog-overlay'], [data-slot='dialog-content']"))
        : false
    }

    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return
      if (document.querySelector("[data-slot='dialog-content']")) return
      setOpen(false)
    }

    function onPointerDown(event: PointerEvent) {
      if (rootRef.current?.contains(event.target as Node)) return
      if (isInsideDialog(event.target)) return
      setOpen(false)
    }

    document.addEventListener("keydown", onKey)
    document.addEventListener("pointerdown", onPointerDown)
    return () => {
      document.removeEventListener("keydown", onKey)
      document.removeEventListener("pointerdown", onPointerDown)
    }
  }, [open])

  if (!selected) return null

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-label="Safety"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((value) => !value)}
        className="grid size-10 shrink-0 place-items-center rounded-full border border-border text-foreground/70 transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)] aria-expanded:border-[var(--accent)] aria-expanded:text-[var(--accent)]"
      >
        <Shield className="size-4" aria-hidden />
      </button>

      {open && (
        <div
          role="region"
          aria-label="Safety"
          className="absolute right-0 top-[calc(100%+0.5rem)] z-40 flex w-[min(20rem,calc(100vw-2rem))] flex-col gap-4 rounded-2xl bg-card p-4 shadow-lg ring-1 ring-foreground/10"
        >
          <p className="font-display text-sm font-semibold text-foreground">Safety</p>

          {members.length > 1 ? (
            <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
              Who
              <span className="relative">
                <select
                  value={selected.userId}
                  onChange={(e) => setSelectedId(e.target.value)}
                  className={SELECT_CLASS}
                >
                  {members.map((member) => (
                    <option key={member.userId} value={member.userId}>
                      {member.firstName}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
              </span>
            </label>
          ) : (
            <p className="text-sm font-medium text-foreground">{selected.firstName}</p>
          )}

          <SafetyActions
            key={selected.userId}
            targetUserId={selected.userId}
            targetLabel={selected.firstName}
            meetupId={meetupId}
            showTrustedContact
            showLabel={false}
          />
        </div>
      )}
    </div>
  )
}
