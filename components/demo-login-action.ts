"use server";

import { getAdminSupabase } from "@/lib/supabase/server";

// Fresh first-run demo user from supabase/seed.sql (id ...0013). It has an
// auth + public.users row but no profile/preferences/availability, so "Enter
// demo" lands on onboarding and the whole setup flow is walkable, without any
// real university email round trip. (The fully-set-up Alex Chen account,
// ...0001, still backs the sessionless demo fallback in lib/current-user.ts.)
const DEMO_USER_EMAIL = "demo.new@usyd.edu.au";

export type DemoLoginTokenResult =
  | { ok: true; email: string; tokenHash: string }
  | { ok: false; error: string };

/**
 * Mints a one-time token for the seeded demo user via the admin API, so the
 * browser client can exchange it for a real Supabase session (`verifyOtp`)
 * without an actual email round trip. The service-role key is used here,
 * server-side only and never returned to the client. Only the resulting
 * token hash is.
 *
 * SECURITY: this action lets anyone who can reach it authenticate as the
 * seeded demo account with zero credentials. It must not ship in a real
 * deployment. `DISABLE_DEMO_LOGIN=true` kills it without a code change.
 */
export async function requestDemoLoginToken(): Promise<DemoLoginTokenResult> {
  if (process.env.DISABLE_DEMO_LOGIN === "true") {
    return { ok: false, error: "Demo login is disabled." };
  }

  try {
    const admin = getAdminSupabase();
    const { data, error } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: DEMO_USER_EMAIL,
    });

    if (error || !data?.user?.id || !data.properties?.hashed_token) {
      return {
        ok: false,
        error: error?.message ?? "Could not generate a demo session token.",
      };
    }

    // Hosted projects are not guaranteed to have had the demo seed rerun.
    // generateLink creates the Auth user when the email is missing, but that
    // does not create the public.users row required by profiles' foreign key.
    // Repair that parent row before handing the browser a session token.
    const { error: publicUserError } = await admin.from("users").upsert(
      {
        id: data.user.id,
        university_email: DEMO_USER_EMAIL,
        is_verified: true,
        is_over_18: true,
      },
      { onConflict: "id" }
    );

    if (publicUserError) {
      return { ok: false, error: publicUserError.message };
    }

    return {
      ok: true,
      email: DEMO_USER_EMAIL,
      tokenHash: data.properties.hashed_token,
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
