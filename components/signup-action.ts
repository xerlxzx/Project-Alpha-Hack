"use server";

import { getAdminSupabase } from "@/lib/supabase/server";

// Mirror of the client-side check in AuthPanel, enforced again server-side.
const UNIVERSITY_EMAIL_RE = /^[^\s@]+@([a-z0-9-]+\.)*edu\.au$/i;

export type SignUpTokenResult =
  | { ok: true; email: string; tokenHash: string }
  | { ok: false; error: string };

/**
 * Creates a new account without any real email round trip.
 *
 * The client's `supabase.auth.signUp` triggers Supabase's built-in
 * confirmation email, whose shared SMTP is heavily rate-limited ("email
 * rate limit exceeded"), which dead-ends signup. Instead we create the user
 * server-side with the admin API and `email_confirm: true` (no email is
 * sent, the account is immediately usable), then mint a one-time magiclink
 * token the browser exchanges for a real session via `verifyOtp`, the same
 * no-email pattern used by the demo login.
 *
 * The service-role key is used here, server-side only, and never returned to
 * the client; only the resulting token hash is.
 */
export async function requestSignUpToken(
  email: string,
  password: string,
): Promise<SignUpTokenResult> {
  const trimmedEmail = email.trim();

  if (!UNIVERSITY_EMAIL_RE.test(trimmedEmail)) {
    return { ok: false, error: "Use a university email, e.g. name@uni.sydney.edu.au" };
  }
  if (password.length < 8) {
    return { ok: false, error: "Password must be at least 8 characters." };
  }

  try {
    const admin = getAdminSupabase();

    const { error: createError } = await admin.auth.admin.createUser({
      email: trimmedEmail,
      password,
      email_confirm: true,
    });

    if (createError) {
      // Don't let a "sign up" grant access to a pre-existing account with an
      // arbitrary password; route them to sign in instead.
      const message = createError.message.toLowerCase();
      if (message.includes("already") || message.includes("registered")) {
        return { ok: false, error: "That email already has an account — sign in instead." };
      }
      return { ok: false, error: createError.message };
    }

    const { data, error: linkError } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: trimmedEmail,
    });

    if (linkError || !data?.properties?.hashed_token) {
      return {
        ok: false,
        error: linkError?.message ?? "Account created, but could not start a session.",
      };
    }

    return { ok: true, email: trimmedEmail, tokenHash: data.properties.hashed_token };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
