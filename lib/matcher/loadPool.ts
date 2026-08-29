// Loads the seeded Supabase pool and maps DB rows (snake_case) into the
// buildMatch input shapes (camelCase + the runtime flags gates/score need).
// Read access here intentionally uses the admin client: matching needs full
// cross-user visibility into strangers' preferences/availability, which the
// 0001 migration's owner-only RLS policies never grant to an authenticated
// user — there is no non-admin path that can answer "who is a candidate for
// this active user" at all.
import type { SupabaseClient } from "@supabase/supabase-js"
import type { AvailabilityMode, AvailabilityWindow, Preferences, Profile } from "@/lib/types"

export type MatchActiveUser = Profile &
  Preferences & {
    id: string
    verified: boolean
    ageOk: boolean
    completedMeetups: number
    availability: AvailabilityWindow[]
  }

export type MatchPoolMember = Profile &
  Preferences & {
    id: string
    verified: boolean
    ageOk: boolean
    safetyProhibited: boolean
    accessibilityMet: boolean
    activityAllowed: boolean
    availability: AvailabilityWindow[]
    priorFeedback?: number
    reliability?: number
  }

export interface AvailabilityOverride {
  startAt: string
  endAt: string
  mode?: AvailabilityMode
}

export interface RequestOverrides {
  travelKm?: number
  budgetAud?: number
  socialEnergy?: string
  availability?: AvailabilityOverride[]
  proposedActivity?: string | null
}

export interface MatchInputs {
  activeUser: MatchActiveUser
  pool: MatchPoolMember[]
  blockedPairs: Array<[string, string]>
}

interface UserRow {
  id: string
  is_verified: boolean
  is_over_18: boolean
}

interface ProfileRow {
  user_id: string
  first_name: string
  photo_url: string | null
  age_range: string | null
  university: string
  course_year: string | null
  created_at: string
  updated_at: string
}

interface PreferencesRow {
  user_id: string
  travel_km: number | null
  budget_aud: number | null
  hobbies: string[]
  interests: string[]
  gender: string | null
  gender_pref: string | null
  language_pref: string | null
  accessibility: string | null
  social_energy: string | null
  weekly_goal: number | null
  area_lat: number | null
  area_lng: number | null
  created_at: string
  updated_at: string
}

interface AvailabilityWindowRow {
  id: string
  user_id: string
  start_at: string
  end_at: string
  mode: AvailabilityMode
  created_at: string
}

function toProfile(row: ProfileRow): Profile {
  return {
    userId: row.user_id,
    firstName: row.first_name,
    photoUrl: row.photo_url,
    ageRange: row.age_range,
    university: row.university,
    courseYear: row.course_year,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function toPreferences(row: PreferencesRow): Preferences {
  return {
    userId: row.user_id,
    travelKm: row.travel_km,
    budgetAud: row.budget_aud,
    hobbies: row.hobbies,
    interests: row.interests,
    gender: row.gender,
    genderPref: row.gender_pref,
    languagePref: row.language_pref,
    accessibility: row.accessibility,
    socialEnergy: row.social_energy,
    weeklyGoal: row.weekly_goal,
    areaLat: row.area_lat,
    areaLng: row.area_lng,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function normalisePreference(value: string | null | undefined): string | null {
  const normalised = value?.trim().toLowerCase().replace(/\s+/g, " ")
  return normalised || null
}

export function accessibilityCompatible(
  activeNeed: string | null | undefined,
  candidateNeed: string | null | undefined
): boolean {
  return normalisePreference(activeNeed) === normalisePreference(candidateNeed)
}

const EXCLUDED_ACTIVITY_PATTERNS = [
  /\balcohol\b/,
  /\bdrinking\b/,
  /\bpub crawl\b/,
  /\bbar crawl\b/,
  /\bwine tasting\b/,
  /\bprivate home\b/,
  /\bhouse party\b/,
  /\bovernight\b/,
  /\bsleepover\b/,
  /\bskydiv(?:e|ing)\b/,
  /\bbungee\b/,
  /\bparticipant'?s? (?:car|vehicle)\b/,
]

export function activitySignalsAllowed(signals: string[]): boolean {
  return signals.every((signal) => {
    const normalised = signal.trim().toLowerCase()
    return !EXCLUDED_ACTIVITY_PATTERNS.some((pattern) => pattern.test(normalised))
  })
}

export function deriveCandidateGateFlags(
  activePreferences: Pick<Preferences, "accessibility">,
  candidatePreferences: Pick<Preferences, "accessibility">,
  proposedActivity?: string | null
): { accessibilityMet: boolean; activityAllowed: boolean } {
  return {
    accessibilityMet: accessibilityCompatible(
      activePreferences.accessibility,
      candidatePreferences.accessibility
    ),
    activityAllowed: activitySignalsAllowed(proposedActivity ? [proposedActivity] : []),
  }
}

function toAvailabilityWindow(row: AvailabilityWindowRow): AvailabilityWindow {
  return {
    id: row.id,
    userId: row.user_id,
    startAt: row.start_at,
    endAt: row.end_at,
    mode: row.mode,
    createdAt: row.created_at,
  }
}

function applyOverrides(preferences: Preferences, overrides?: RequestOverrides): Preferences {
  if (!overrides) return preferences
  return {
    ...preferences,
    travelKm: overrides.travelKm ?? preferences.travelKm,
    budgetAud: overrides.budgetAud ?? preferences.budgetAud,
    socialEnergy: overrides.socialEnergy ?? preferences.socialEnergy,
  }
}

function overrideAvailability(userId: string, stored: AvailabilityWindow[], overrides?: RequestOverrides): AvailabilityWindow[] {
  if (!overrides?.availability?.length) return stored
  return overrides.availability.map((window, index) => ({
    id: `override-${userId}-${index}`,
    userId,
    startAt: window.startAt,
    endAt: window.endAt,
    mode: window.mode ?? "im_free",
    createdAt: new Date().toISOString(),
  }))
}

// A candidate is safety-prohibited once a report about them has escalated to
// the private review state (PRD §10: "Multiple or serious reports trigger a
// private review state"). Reports carry no participant-facing SELECT policy
// at all, so this only works via the admin client.
async function fetchSafetyProhibitedIds(supabase: SupabaseClient, userIds: string[]): Promise<Set<string>> {
  if (userIds.length === 0) return new Set()
  const { data, error } = await supabase
    .from("reports")
    .select("reported")
    .eq("status", "review")
    .in("reported", userIds)
  if (error) throw new Error(`Failed to load reports: ${error.message}`)
  return new Set((data ?? []).map((row) => row.reported as string))
}

// Reliability is private (PRD §9.12/§10) — read via the admin client only,
// never exposed in the route's response. `user_reliability.score` is 0..100;
// scoreCandidate wants 0..1.
async function fetchReliabilityById(supabase: SupabaseClient, userIds: string[]): Promise<Map<string, number>> {
  if (userIds.length === 0) return new Map()
  const { data, error } = await supabase
    .from("user_reliability")
    .select("user_id, score")
    .in("user_id", userIds)
  if (error) throw new Error(`Failed to load reliability: ${error.message}`)
  return new Map((data ?? []).map((row) => [row.user_id as string, (row.score as number) / 100]))
}

// Previous-feedback signal: share of feedback a candidate has received
// (across all their past meetups) that was positive (`meet_again` or a
// "great_group" reaction). Candidates with no feedback history are left out
// of the map so scoreCandidate falls back to its own neutral default rather
// than us fabricating a 0.
async function fetchPriorFeedbackById(supabase: SupabaseClient, userIds: string[]): Promise<Map<string, number>> {
  if (userIds.length === 0) return new Map()
  const { data, error } = await supabase
    .from("feedback")
    .select("about_user, meet_again, group_reaction")
    .in("about_user", userIds)
  if (error) throw new Error(`Failed to load feedback: ${error.message}`)

  const totals = new Map<string, { positive: number; total: number }>()
  for (const row of data ?? []) {
    const userId = row.about_user as string | null
    if (!userId) continue
    const entry = totals.get(userId) ?? { positive: 0, total: 0 }
    entry.total += 1
    if (row.meet_again === true || row.group_reaction === "great_group") entry.positive += 1
    totals.set(userId, entry)
  }

  const result = new Map<string, number>()
  for (const [userId, { positive, total }] of totals) {
    result.set(userId, total > 0 ? positive / total : 0)
  }
  return result
}

async function fetchCompletedMeetupCount(supabase: SupabaseClient, userId: string): Promise<number> {
  const { data, error } = await supabase
    .from("meetup_members")
    .select("meetups!inner(status)")
    .eq("user_id", userId)
    .eq("meetups.status", "completed")
  if (error) throw new Error(`Failed to load completed meetups: ${error.message}`)
  return (data ?? []).length
}

async function fetchBlockedPairs(supabase: SupabaseClient, activeUserId: string): Promise<Array<[string, string]>> {
  const { data, error } = await supabase
    .from("blocks")
    .select("blocker, blocked")
    .or(`blocker.eq.${activeUserId},blocked.eq.${activeUserId}`)
  if (error) throw new Error(`Failed to load blocks: ${error.message}`)
  return (data ?? []).map((row) => [row.blocker as string, row.blocked as string])
}

export async function loadMatchInputs(
  supabase: SupabaseClient,
  activeUserId: string,
  overrides?: RequestOverrides
): Promise<MatchInputs> {
  const [usersRes, profilesRes, preferencesRes, availabilityRes] = await Promise.all([
    supabase.from("users").select("id, is_verified, is_over_18"),
    supabase.from("profiles").select("user_id, first_name, photo_url, age_range, university, course_year, created_at, updated_at"),
    supabase
      .from("preferences")
      .select(
        "user_id, travel_km, budget_aud, hobbies, interests, gender, gender_pref, language_pref, accessibility, social_energy, weekly_goal, area_lat, area_lng, created_at, updated_at"
      ),
    supabase.from("availability_windows").select("id, user_id, start_at, end_at, mode, created_at"),
  ])

  for (const res of [usersRes, profilesRes, preferencesRes, availabilityRes]) {
    if (res.error) throw new Error(`Failed to load pool data: ${res.error.message}`)
  }

  const users = (usersRes.data ?? []) as UserRow[]
  const profiles = new Map(((profilesRes.data ?? []) as ProfileRow[]).map((row) => [row.user_id, toProfile(row)]))
  const preferences = new Map(
    ((preferencesRes.data ?? []) as PreferencesRow[]).map((row) => [row.user_id, toPreferences(row)])
  )
  const availabilityByUser = new Map<string, AvailabilityWindow[]>()
  for (const row of (availabilityRes.data ?? []) as AvailabilityWindowRow[]) {
    const window = toAvailabilityWindow(row)
    const existing = availabilityByUser.get(window.userId) ?? []
    existing.push(window)
    availabilityByUser.set(window.userId, existing)
  }

  const activeUserRow = users.find((u) => u.id === activeUserId)
  if (!activeUserRow) throw new Error(`Active user ${activeUserId} not found`)
  const activeProfile = profiles.get(activeUserId)
  const activePreferences = preferences.get(activeUserId)
  if (!activeProfile || !activePreferences) throw new Error(`Active user ${activeUserId} is missing profile/preferences`)

  const poolUserIds = users.filter((u) => u.id !== activeUserId).map((u) => u.id)

  const [safetyProhibitedIds, reliabilityById, priorFeedbackById, completedMeetups, blockedPairs] = await Promise.all([
    fetchSafetyProhibitedIds(supabase, poolUserIds),
    fetchReliabilityById(supabase, poolUserIds),
    fetchPriorFeedbackById(supabase, poolUserIds),
    fetchCompletedMeetupCount(supabase, activeUserId),
    fetchBlockedPairs(supabase, activeUserId),
  ])

  const activeUser: MatchActiveUser = {
    ...activeProfile,
    ...applyOverrides(activePreferences, overrides),
    id: activeUserId,
    verified: activeUserRow.is_verified,
    ageOk: activeUserRow.is_over_18,
    completedMeetups,
    availability: overrideAvailability(activeUserId, availabilityByUser.get(activeUserId) ?? [], overrides),
  }

  const pool: MatchPoolMember[] = poolUserIds
    .map((userId) => {
      const profile = profiles.get(userId)
      const userPreferences = preferences.get(userId)
      const userRow = users.find((u) => u.id === userId)
      if (!profile || !userPreferences || !userRow) return null
      const gateFlags = deriveCandidateGateFlags(
        activePreferences,
        userPreferences,
        overrides?.proposedActivity
      )
      const member: MatchPoolMember = {
        ...profile,
        ...userPreferences,
        id: userId,
        verified: userRow.is_verified,
        ageOk: userRow.is_over_18,
        safetyProhibited: safetyProhibitedIds.has(userId),
        ...gateFlags,
        availability: availabilityByUser.get(userId) ?? [],
        priorFeedback: priorFeedbackById.get(userId),
        reliability: reliabilityById.get(userId),
      }
      return member
    })
    .filter((member): member is MatchPoolMember => member !== null)

  return { activeUser, pool, blockedPairs }
}
