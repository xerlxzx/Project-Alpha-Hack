import { AI_REQUEST_DAILY_LIMIT } from "@/lib/config"
import { getAdminSupabase } from "@/lib/supabase/server"

// Global (all-users) daily cap on routes that spend Gemini/Places quota:
// venue-agent, meetups/[id]/reroll, feedback. Backed by
// public.api_rate_limits so the count is shared across serverless
// invocations, not per-instance memory. Fails open (allows the request) on
// a Supabase error, since the count going wrong should never itself take
// venue recommendations down.
export async function allowAiRequest(): Promise<boolean> {
  const day = new Date().toISOString().slice(0, 10)
  const supabase = getAdminSupabase()

  const { data, error } = await supabase.rpc("increment_api_rate_limit", {
    p_day: day,
    p_limit: AI_REQUEST_DAILY_LIMIT,
  })

  if (error) {
    return true
  }
  return data === true
}
