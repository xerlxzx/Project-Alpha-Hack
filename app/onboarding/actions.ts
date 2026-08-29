"use server";

import { GoogleGenAI } from "@google/genai";
import { z } from "zod";

import { GEMINI_MODEL, getEnv } from "@/lib/config";
import { getAdminSupabase, getServerSupabase } from "@/lib/supabase/server";
import { getCurrentUser, type CurrentUser } from "@/lib/current-user";

const PHOTO_BUCKET = "profile-photos";

const FREE_TEXT_MAX_LEN = 500;

const TagsSchema = z.object({
  tags: z.array(z.string().min(1).max(40)).max(10),
});

/**
 * The client to write profile/preferences data with, for a user already
 * resolved via getCurrentUser(), never from client-supplied input. A real
 * session uses the RLS-enforced server client (auth.uid() = resolved id, so
 * the owner-only policies pass); the demo identity has no real session, so
 * RLS would reject it. The admin client handles
 * that path (see lib/current-user.ts).
 */
async function getWriteClient(user: CurrentUser) {
  return user.isDemo ? getAdminSupabase() : await getServerSupabase();
}

function errorMessage(error: unknown, fallback: string): string {
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
async function ensurePublicUserRow(user: CurrentUser): Promise<void> {
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

function dedupeTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

function buildTagPrompt(freeText: string): string {
  return [
    "A student answered \"What would you like to do more of?\" for a social",
    "meetup app's onboarding. Convert their free-text answer into a short",
    "list of editable interest/activity tags (2-6 words each, no hashtags,",
    "no punctuation-only tags).",
    "Return ONLY JSON matching the given schema. No prose.",
    `Answer: ${JSON.stringify(freeText)}`,
  ].join("\n");
}

/**
 * Calls Gemini to extract tags from free text. One retry on failure.
 * A total failure leaves the tag list empty rather than blocking the flow.
 */
export async function extractTags(
  freeText: string
): Promise<{ tags: string[]; error?: string }> {
  const trimmed = freeText.trim().slice(0, FREE_TEXT_MAX_LEN);
  if (!trimmed) {
    return { tags: [] };
  }

  const ai = new GoogleGenAI({ apiKey: getEnv("GEMINI_API_KEY") });

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: buildTagPrompt(trimmed),
        config: {
          responseMimeType: "application/json",
          responseSchema: z.toJSONSchema(TagsSchema),
        },
      });
      const text = response.text;
      if (!text) throw new Error("Gemini returned no structured output");
      const parsed = TagsSchema.parse(JSON.parse(text));
      return { tags: dedupeTags(parsed.tags) };
    } catch {
      // First failure: retry once. Second failure: fall through below.
    }
  }

  return {
    tags: [],
    error: "AI tag extraction failed, so add tags yourself below.",
  };
}

function buildSuggestPrompt(current: string[]): string {
  return [
    "A student is picking interests for a social meetup app. Given the",
    "interests they've already added, suggest up to 6 ADDITIONAL related",
    "interest/activity tags they might also enjoy. Each tag 1-3 words, no",
    "hashtags, no duplicates of what they already have.",
    "Return ONLY JSON matching the given schema. No prose.",
    `Already added: ${JSON.stringify(current)}`,
  ].join("\n");
}

/**
 * Suggests related interest tags from the ones a user has already added.
 * Best-effort: any failure returns an empty list so the UI stays usable.
 */
export async function suggestInterests(
  current: string[]
): Promise<{ tags: string[]; error?: string }> {
  const cleaned = dedupeTags(current).slice(0, 20);
  if (cleaned.length === 0) return { tags: [] };

  const ai = new GoogleGenAI({ apiKey: getEnv("GEMINI_API_KEY") });
  const lower = new Set(cleaned.map((t) => t.toLowerCase()));

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: buildSuggestPrompt(cleaned),
        config: {
          responseMimeType: "application/json",
          responseSchema: z.toJSONSchema(TagsSchema),
        },
      });
      const text = response.text;
      if (!text) throw new Error("Gemini returned no structured output");
      const parsed = TagsSchema.parse(JSON.parse(text));
      // Drop anything the user already has.
      const fresh = dedupeTags(parsed.tags).filter((t) => !lower.has(t.toLowerCase()));
      return { tags: fresh };
    } catch {
      // First failure: retry. Second: fall through.
    }
  }

  return { tags: [], error: "Couldn't fetch suggestions, add your own instead." };
}

async function ensurePhotoBucketExists(): Promise<void> {
  const admin = getAdminSupabase();
  const { error } = await admin.storage.createBucket(PHOTO_BUCKET, {
    public: true,
    fileSizeLimit: "2MB",
  });
  // "already exists" is expected on every call after the first. The bucket
  // check-then-create isn't atomic, so this is the only reliable way to make
  // ensure idempotent without a dedicated migration (out of scope: this
  // session owns app/onboarding only).
  if (error && !/already exists/i.test(error.message)) {
    throw error;
  }
}

/**
 * Uploads a profile photo (already downscaled client-side, see
 * PhotoStep.tsx) to Supabase Storage and returns its public URL.
 */
export async function uploadProfilePhoto(
  formData: FormData
): Promise<{ url: string } | { error: string }> {
  const file = formData.get("photo");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "No photo provided." };
  }
  if (file.size > 2 * 1024 * 1024) {
    return { error: "Photo is too large." };
  }

  const user = await getCurrentUser();
  if (!user) {
    return { error: "Not authenticated." };
  }

  try {
    await ensurePhotoBucketExists();
    // Storage has no RLS policies defined (see supabase/migrations) for
    // either identity, so the admin client is required. Only
    // the path (derived from the resolved, non-spoofable user id) changes.
    const admin = getAdminSupabase();
    const path = `${user.id}/${Date.now()}.jpg`;

    const { error: uploadError } = await admin.storage
      .from(PHOTO_BUCKET)
      .upload(path, file, { contentType: "image/jpeg", upsert: true });
    if (uploadError) throw uploadError;

    const { data } = admin.storage.from(PHOTO_BUCKET).getPublicUrl(path);
    return { url: data.publicUrl };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Photo upload failed.",
    };
  }
}

export interface SaveOnboardingPayload {
  firstName: string;
  photoUrl: string | null;
  ageRange: string | null;
  university: string;
  areaLat: number | null;
  areaLng: number | null;
  travelKm: number | null;
  budgetAud: number;
  hobbies: string[];
  interests: string[];
  availabilityMode: "im_free" | "plan_ahead";
  availabilityStartAt: string;
  availabilityEndAt: string;
  languagePref?: string;
  genderPref?: string;
  accessibility?: string;
  socialEnergy?: string;
}

export async function saveOnboarding(
  payload: SaveOnboardingPayload
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!payload.firstName.trim() || !payload.university.trim()) {
    return { ok: false, error: "First name and university are required." };
  }

  const user = await getCurrentUser();
  if (!user) {
    return { ok: false, error: "Not authenticated." };
  }

  try {
    await ensurePublicUserRow(user);
    const client = await getWriteClient(user);

    // user.id is the only source of identity here, resolved server-side by
    // getCurrentUser() from the session cookie (or the demo fallback), never
    // from payload/client input. This can never write to another
    // caller's row.
    const { error: profileError } = await client
      .from("profiles")
      .upsert(
        {
          user_id: user.id,
          first_name: payload.firstName.trim(),
          photo_url: payload.photoUrl,
          age_range: payload.ageRange,
          university: payload.university.trim(),
        },
        { onConflict: "user_id" }
      );
    if (profileError) throw profileError;

    const { error: prefsError } = await client
      .from("preferences")
      .upsert(
        {
          user_id: user.id,
          travel_km: payload.travelKm,
          budget_aud: payload.budgetAud,
          hobbies: payload.hobbies,
          interests: payload.interests,
          gender_pref: payload.genderPref || null,
          language_pref: payload.languagePref || null,
          accessibility: payload.accessibility || null,
          social_energy: payload.socialEnergy || null,
          area_lat: payload.areaLat,
          area_lng: payload.areaLng,
        },
        { onConflict: "user_id" }
      );
    if (prefsError) throw prefsError;

    const { error: availabilityError } = await client
      .from("availability_windows")
      .insert({
        user_id: user.id,
        start_at: payload.availabilityStartAt,
        end_at: payload.availabilityEndAt,
        mode: payload.availabilityMode,
      });
    if (availabilityError) throw availabilityError;

    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: errorMessage(err, "Could not save onboarding."),
    };
  }
}
