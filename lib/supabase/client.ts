import { createBrowserClient } from "@supabase/ssr"

// Browser client — safe to import from client components. Uses the
// publicly-exposed anon key only.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
