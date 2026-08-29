"use server";

import { getAdminSupabase } from "@/lib/supabase/server";

// Seeded active user from supabase/seed.sql. The whole demo
// journey is walkable as, without any real university email round trip.
const DEMO_USER_EMAIL = "alex.chen@usyd.edu.au";

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

    if (error || !data?.properties?.hashed_token) {
      return {
        ok: false,
        error: error?.message ?? "Could not generate a demo session token.",
      };
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
