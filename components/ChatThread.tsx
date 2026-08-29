"use client"

import * as React from "react"
import { motion, useReducedMotion } from "framer-motion"
import { Send } from "lucide-react"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { sendChatMessage } from "@/app/meetup/[id]/actions"

// Local fallback while components/motion/tokens is unavailable.
const bubbleSpring = { type: "spring", stiffness: 320, damping: 24 } as const

/**
 * Staged-reveal wrapper for the identity-reveal member grid.
 * Lives here (rather than a dedicated file) because page.tsx is a Server
 * Component and this needs framer-motion.
 */
export function MemberReveal({
  children,
  delay = 0,
}: {
  children: React.ReactNode
  delay?: number
}) {
  const reduce = useReducedMotion()
  return (
    <motion.div
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 18, filter: "blur(6px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={{ type: "spring", stiffness: 130, damping: 20, mass: 0.9, delay }}
    >
      {children}
    </motion.div>
  )
}

export interface ChatMember {
  userId: string
  firstName: string
  photoUrl: string | null
}

export interface ChatMessage {
  id: string
  userId: string
  body: string
  createdAt: string
}

interface OptimisticMessage extends ChatMessage {
  pending?: boolean
  failed?: boolean
}

export interface ChatThreadProps {
  meetupId: string
  currentUserId: string
  initialMessages: ChatMessage[]
  /** First name and photo keyed by user_id. */
  members: Record<string, ChatMember>
}

/**
 * Seeded messages render immediately; the active user's own send is
 * optimistic (shown instantly, reconciled or rolled back once the server
 * action returns). Bubble color distinguishes the current user from others.
 */
export function ChatThread({
  meetupId,
  currentUserId,
  initialMessages,
  members,
}: ChatThreadProps) {
  const [messages, setMessages] = React.useState<OptimisticMessage[]>(initialMessages)
  const [draft, setDraft] = React.useState("")
  const [sending, setSending] = React.useState(false)
  const scrollRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages.length])

  async function handleSend(event: React.FormEvent) {
    event.preventDefault()
    const body = draft.trim()
    if (!body || sending) return

    const tempId = `pending-${Date.now()}`
    setMessages((prev) => [
      ...prev,
      { id: tempId, userId: currentUserId, body, createdAt: new Date().toISOString(), pending: true },
    ])
    setDraft("")
    setSending(true)

    const result = await sendChatMessage(meetupId, body)

    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== tempId) return m
        if (result.data) {
          return {
            id: result.data.id,
            userId: result.data.user_id,
            body: result.data.body,
            createdAt: result.data.created_at,
          }
        }
        return { ...m, pending: false, failed: true }
      })
    )
    setSending(false)
  }

  return (
    <div className="flex flex-col overflow-hidden rounded-2xl bg-card ring-1 ring-foreground/10">
      <div ref={scrollRef} className="flex max-h-[420px] flex-col gap-2.5 overflow-y-auto p-4">
        {messages.map((message) => (
          <Bubble
            key={message.id}
            message={message}
            isMine={message.userId === currentUserId}
            author={members[message.userId]}
          />
        ))}
      </div>

      <form onSubmit={handleSend} className="flex items-center gap-2 border-t border-border p-3">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Message the group…"
          maxLength={2000}
          disabled={sending}
          aria-label="Message"
        />
        <Button type="submit" size="icon" disabled={sending || !draft.trim()} aria-label="Send message">
          <Send />
        </Button>
      </form>
    </div>
  )
}

function Bubble({
  message,
  isMine,
  author,
}: {
  message: OptimisticMessage
  isMine: boolean
  author?: ChatMember
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: message.failed ? 0.7 : 1, y: 0 }}
      transition={bubbleSpring}
      className={cn("flex items-end gap-2", isMine && "flex-row-reverse")}
    >
      {!isMine && (
        <Avatar size="sm" className="mb-0.5 shrink-0">
          <AvatarImage src={author?.photoUrl ?? undefined} alt={author?.firstName ?? "Member"} />
          <AvatarFallback>{(author?.firstName ?? "?").slice(0, 1)}</AvatarFallback>
        </Avatar>
      )}
      <div
        className={cn(
          "max-w-[75%] rounded-2xl px-3.5 py-2 text-sm",
          isMine ? "bg-accent text-accent-foreground" : "bg-muted text-foreground"
        )}
      >
        {!isMine && (
          <div className="mb-0.5 text-xs font-medium text-muted-foreground">
            {author?.firstName ?? "Member"}
          </div>
        )}
        <div className="whitespace-pre-wrap break-words">{message.body}</div>
        {message.failed && (
          <div className="mt-1 text-[0.7rem] font-medium text-destructive">
            Failed to send — try again
          </div>
        )}
        {message.pending && !message.failed && (
          <div className="mt-1 text-[0.7rem] opacity-70">Sending…</div>
        )}
      </div>
    </motion.div>
  )
}
