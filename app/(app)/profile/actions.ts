"use server";

import { getCurrentUser } from "@/lib/current-user";
import { getWriteClient, ensurePublicUserRow, errorMessage } from "@/lib/profile-write";
import { uploadProfilePhoto } from "@/app/onboarding/actions";

type ActionResult = { ok: true } | { ok: false; error: string };

export interface UpdateProfileBasicsPayload {
  firstName: string;
  ageRange: string | null;
  university: string;
  courseYear: string | null;
}

export async function updateProfileBasics(
  payload: UpdateProfileBasicsPayload
): Promise<ActionResult> {
  if (!payload.firstName.trim() || !payload.university.trim()) {
    return { ok: false, error: "First name and university are required." };
  }

  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not authenticated." };

  try {
    await ensurePublicUserRow(user);
    const client = await getWriteClient(user);

    // user.id is the only source of identity here, resolved server-side by
    // getCurrentUser(), never from payload/client input.
    const { error } = await client.from("profiles").upsert(
      {
        user_id: user.id,
        first_name: payload.firstName.trim(),
        age_range: payload.ageRange,
        university: payload.university.trim(),
        course_year: payload.courseYear,
      },
      { onConflict: "user_id" }
    );
    if (error) throw error;

    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorMessage(err, "Could not save profile.") };
  }
}

/** Uploads a new photo (reusing onboarding's storage path) and saves it as the user's photo_url. */
export async function updateProfilePhoto(
  formData: FormData
): Promise<{ url: string } | { error: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Not authenticated." };

  const uploadResult = await uploadProfilePhoto(formData);
  if ("error" in uploadResult) return uploadResult;

  try {
    await ensurePublicUserRow(user);
    const client = await getWriteClient(user);
    const { error } = await client
      .from("profiles")
      .upsert({ user_id: user.id, photo_url: uploadResult.url }, { onConflict: "user_id" });
    if (error) throw error;

    return { url: uploadResult.url };
  } catch (err) {
    return { error: errorMessage(err, "Could not save your new photo.") };
  }
}

export async function updateWeeklyGoal(weeklyGoal: number): Promise<ActionResult> {
  if (!Number.isInteger(weeklyGoal) || weeklyGoal < 1 || weeklyGoal > 14) {
    return { ok: false, error: "Weekly goal must be between 1 and 14." };
  }

  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not authenticated." };

  try {
    await ensurePublicUserRow(user);
    const client = await getWriteClient(user);
    const { error } = await client
      .from("preferences")
      .upsert({ user_id: user.id, weekly_goal: weeklyGoal }, { onConflict: "user_id" });
    if (error) throw error;

    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorMessage(err, "Could not save your weekly goal.") };
  }
}

export interface UpdateMatchingPreferencesPayload {
  travelKm: number | null;
  budgetAud: number | null;
  /**
   * Replaces both `interests` and `hobbies`: the matcher unions the two
   * columns everywhere it reads them (lib/matcher/score.ts), so a single
   * edited list written to `interests` with `hobbies` cleared is behaviorally
   * identical while giving settings one tag editor instead of two.
   */
  interests: string[];
  genderPref: string | null;
  languagePref: string | null;
  accessibility: string | null;
  socialEnergy: string | null;
}

export async function updateMatchingPreferences(
  payload: UpdateMatchingPreferencesPayload
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not authenticated." };

  try {
    await ensurePublicUserRow(user);
    const client = await getWriteClient(user);
    const { error } = await client.from("preferences").upsert(
      {
        user_id: user.id,
        travel_km: payload.travelKm,
        budget_aud: payload.budgetAud,
        interests: payload.interests,
        hobbies: [],
        gender_pref: payload.genderPref || null,
        language_pref: payload.languagePref || null,
        accessibility: payload.accessibility || null,
        social_energy: payload.socialEnergy || null,
      },
      { onConflict: "user_id" }
    );
    if (error) throw error;

    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorMessage(err, "Could not save your preferences.") };
  }
}

export interface UpdateNotificationPrefsPayload {
  notifyMatchFound: boolean;
  notifyMeetupReminders: boolean;
  notifyWeeklySummary: boolean;
}

export async function updateNotificationPrefs(
  payload: UpdateNotificationPrefsPayload
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not authenticated." };

  try {
    await ensurePublicUserRow(user);
    const client = await getWriteClient(user);
    const { error } = await client.from("preferences").upsert(
      {
        user_id: user.id,
        notify_match_found: payload.notifyMatchFound,
        notify_meetup_reminders: payload.notifyMeetupReminders,
        notify_weekly_summary: payload.notifyWeeklySummary,
      },
      { onConflict: "user_id" }
    );
    if (error) throw error;

    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorMessage(err, "Could not save notification settings.") };
  }
}
