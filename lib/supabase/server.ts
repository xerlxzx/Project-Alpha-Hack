// Server-only module. Do not import from client components — it pulls in
// `next/headers`, which throws a build error if bundled for the client.
// (The `server-only` package isn't a project dependency and adding it is
// out of scope for this task, so this import is the enforcement mechanism.)
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
            // Called from a Server Component, where cookies can't be
            // written. Safe to ignore as long as sessions get refreshed
            // from a Server Action or Route Handler instead — there is no
            // middleware/proxy in this repo doing that yet.
          }
        },
      },
    }
  )
}

// Privileged admin client — bypasses RLS via the service-role key. Never
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
