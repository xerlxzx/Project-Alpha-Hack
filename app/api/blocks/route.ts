import { NextResponse } from "next/server"
import { z } from "zod"
import { getCurrentUser } from "@/lib/current-user"
import { getAdminSupabase } from "@/lib/supabase/server"

// Blocks a participant. The blocker is the session user, never client-supplied.
const BlockRequestSchema = z.object({
  blocked: z.string().min(1),
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

  const parsed = BlockRequestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 })
  }

  const blocker = currentUser.id
  const { blocked } = parsed.data

  if (blocker === blocked) {
    return NextResponse.json({ error: "cannot_block_self" }, { status: 400 })
  }

  // Idempotent: re-blocking someone already blocked is a no-op, not an error
  // (the table has a unique (blocker, blocked) constraint).
  const supabase = getAdminSupabase()
  const { error } = await supabase
    .from("blocks")
    .upsert({ blocker, blocked }, { onConflict: "blocker,blocked", ignoreDuplicates: true })

  if (error) {
    return NextResponse.json({ error: "persist_failed", detail: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
