import { NextResponse } from "next/server"
import { z } from "zod"
import { getCurrentUser } from "@/lib/current-user"
import { getAdminSupabase } from "@/lib/supabase/server"

// Reports require a category and optional detail. The reporter is the session
// user, never client-supplied.
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

  // Inserts a row with status 'open'. Escalation to 'review' is a separate
  // moderation concern handled outside this route.
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

  // Response confirms receipt only; report history is never visible to participants.
  return NextResponse.json({ ok: true })
}
