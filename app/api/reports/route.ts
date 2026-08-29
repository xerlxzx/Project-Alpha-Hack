import { NextResponse } from "next/server"
import { z } from "zod"
import { getCurrentUser } from "@/lib/current-user"
import { getAdminSupabase } from "@/lib/supabase/server"

// PRD §9.16 / §10 — reports require a category and optional supporting
// detail. The reporter is always the session user (never client-supplied).
const ReportRequestSchema = z.object({
  reported: z.string().min(1),
  category: z.string().min(1).max(80),
  detail: z.string().max(2000).optional(),
  meetupId: z.string().min(1).optional(),
})

export async function POST(request: Request) {
  const currentUser = await getCurrentUser()
  if (!currentUser) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 })
  }

  const parsed = ReportRequestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 })
  }

  const reporter = currentUser.id
  const { reported, category, detail, meetupId } = parsed.data

  if (reporter === reported) {
    return NextResponse.json({ error: "cannot_report_self" }, { status: 400 })
  }

  // PRD §10: one report only *records* — it never auto-punishes. This
  // inserts a row with status 'open'; escalation to the private 'review'
  // state (on multiple/serious reports) is a separate moderation concern,
  // not done here.
  const supabase = getAdminSupabase()
  const { error } = await supabase.from("reports").insert({
    reporter,
    reported,
    meetup_id: meetupId ?? null,
    category,
    detail: detail ?? null,
    status: "open",
  })

  if (error) {
    return NextResponse.json({ error: "persist_failed", detail: error.message }, { status: 500 })
  }

  // Report history is never visible to participants (PRD §10) — the response
  // confirms receipt and nothing more.
  return NextResponse.json({ ok: true })
}
