"use server";

import { GoogleGenAI } from "@google/genai";
import { z } from "zod";

import { GEMINI_MODEL, getEnv } from "@/lib/config";
import { getAdminSupabase, getServerSupabase } from "@/lib/supabase/server";

// Seeded active demo user (supabase/seed.sql) — used whenever there is no
// real Supabase Auth session, so the flow is walkable without signing in.
const DEMO_USER_ID = "00000000-0000-0000-0001-000000000001";

const PHOTO_BUCKET = "profile-photos";

const FREE_TEXT_MAX_LEN = 500;

const TagsSchema = z.object({
  tags: z.array(z.string().min(1).max(40)).max(10),
});

async function getCurrentUserId(): Promise<string> {
  const supabase = await getServerSupabase();
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? DEMO_USER_ID;
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
    "Return ONLY JSON matching the given schema — no prose.",
    `Answer: ${JSON.stringify(freeText)}`,
  ].join("\n");
}

/**
 * Gemini free-text → tags (PRD §9.2). One retry on failure, venue-agent
 * style; the caller (tag-review step) always has an editable/removable list
 * so a total failure just means the user starts from an empty tag set
 * instead of the flow dead-ending.
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
    error: "AI tag extraction failed — add tags yourself below.",
  };
}

async function ensurePhotoBucketExists(): Promise<void> {
  const admin = getAdminSupabase();
  const { error } = await admin.storage.createBucket(PHOTO_BUCKET, {
    public: true,
    fileSizeLimit: "2MB",
  });
  // "already exists" is expected on every call after the first — the bucket
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

  try {
    await ensurePhotoBucketExists();
    const userId = await getCurrentUserId();
    const admin = getAdminSupabase();
    const path = `${userId}/${Date.now()}.jpg`;

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
  travelKm: number;
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

  try {
    const userId = await getCurrentUserId();
    const admin = getAdminSupabase();

    const { error: profileError } = await admin
      .from("profiles")
      .upsert(
        {
          user_id: userId,
          first_name: payload.firstName.trim(),
          photo_url: payload.photoUrl,
          age_range: payload.ageRange,
          university: payload.university.trim(),
        },
        { onConflict: "user_id" }
      );
    if (profileError) throw profileError;

    const { error: prefsError } = await admin
      .from("preferences")
      .upsert(
        {
          user_id: userId,
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

    const { error: availabilityError } = await admin
      .from("availability_windows")
      .insert({
        user_id: userId,
        start_at: payload.availabilityStartAt,
        end_at: payload.availabilityEndAt,
        mode: payload.availabilityMode,
      });
    if (availabilityError) throw availabilityError;

    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Could not save onboarding.",
    };
  }
}
