import { getAdminSupabase, getServerSupabase } from "@/lib/supabase/server";
import type { CurrentUser } from "@/lib/current-user";

// Shared write-path plumbing for anything that upserts profiles/preferences
// (onboarding, profile settings). Not a "use server" module itself -- a
// "use server" file's exports must all be async server actions, and
// errorMessage() is sync, so this stays a plain server-only lib that those
// action files import from.

/**
 * The client to write profile/preferences data with, for a user already
 * resolved via getCurrentUser(), never from client-supplied input. A real
 * session uses the RLS-enforced server client (auth.uid() = resolved id, so
 * the owner-only policies pass); the demo identity has no real session, so
 * RLS would reject it. The admin client handles that path (see
 * lib/current-user.ts).
 */
export async function getWriteClient(user: CurrentUser) {
  return user.isDemo ? getAdminSupabase() : await getServerSupabase();
}

export function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message;
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }
  return fallback;
}

/**
 * Ensure the authenticated identity has the public.users parent row required
 * by profiles/preferences. This repairs accounts created by Supabase's admin
 * magic-link flow on projects where the demo seed has not been rerun.
 */
export async function ensurePublicUserRow(user: CurrentUser): Promise<void> {
  const admin = getAdminSupabase();
  const { data: existing, error: lookupError } = await admin
    .from("users")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  if (lookupError) throw lookupError;
  if (existing) return;

  const { data, error: authError } = await admin.auth.admin.getUserById(user.id);
  if (authError) throw authError;

  const email = data.user?.email;
  if (!email) throw new Error("The signed-in account has no email address.");

  const { error: insertError } = await admin.from("users").upsert(
    {
      id: user.id,
      university_email: email,
      is_verified: Boolean(data.user.email_confirmed_at),
      is_over_18: true,
    },
    { onConflict: "id" }
  );
  if (insertError) throw insertError;
}
