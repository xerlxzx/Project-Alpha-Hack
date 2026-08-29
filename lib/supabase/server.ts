// Server-only module. Never import from client components; next/headers
// cannot enter the client bundle.
import { cookies } from "next/headers"
import { createServerClient } from "@supabase/ssr"
import { createClient as createSupabaseClient } from "@supabase/supabase-js"
import { getEnv } from "@/lib/config"

// SSR client (cookie-based) for use in Server Components, Server Actions,
// and Route Handlers. Respects RLS via the anon key + the caller's session.
export async function getServerSupabase() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Server Components cannot write cookies. Server Actions and
            // Route Handlers refresh sessions.
          }
        },
      },
    }
  )
}

// Privileged admin client. Bypasses RLS via the service-role key. Never
// import this into client code or any module reachable from the browser
// bundle.
export function getAdminSupabase() {
  return createSupabaseClient(
    getEnv("NEXT_PUBLIC_SUPABASE_URL"),
    getEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// Trivial connectivity check against a known table (public.users, from
// supabase/migrations/0001_schema.sql). Errors are reported, not thrown.
export async function pingSupabase(): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await getServerSupabase()
    const { error } = await supabase
      .from("users")
      .select("id", { head: true, count: "exact" })

    if (error) {
      return { ok: false, error: error.message }
    }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
