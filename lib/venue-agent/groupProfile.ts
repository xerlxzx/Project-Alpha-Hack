import type { GroupProfile } from "@/lib/venue-agent/agent"

// Fallbacks for members without a stored preference. Kept in sync with
// app/api/venue-agent/route.ts's original constants.
const DEFAULT_BUDGET_AUD = 20
const DEFAULT_TRAVEL_KM = 10

export interface MemberProfileInput {
  interests: string[]
  hobbies: string[]
  budgetAud: number | null
  travelKm: number | null
  areaLat?: number | null
  areaLng?: number | null
  accessibility: string | null
}

export interface BuildGroupProfileOptions {
  fallbackCenter: { lat: number; lng: number }
  // Explicit, not derived from members.length: a caller may know a member
  // exists (e.g. from meetup_members) even when that member has no
  // preferences row and so contributes nothing to `members`.
  groupSize: number
  allowedCategories?: string[]
}

// Pure aggregation shared by the post-acceptance path (buildGroupProfileForMeetup,
// backed by DB rows) and the concierge preview path (backed by data already
// loaded in memory via loadMatchInputs). Most-restrictive-member-wins for
// budget/travel, matching lib/matcher/score.ts's closenessRadius(a, b) = min(a, b)
// convention.
export function buildGroupProfileFromMembers(
  members: MemberProfileInput[],
  options: BuildGroupProfileOptions
): GroupProfile {
  const interests = Array.from(new Set(members.flatMap((member) => [...member.interests, ...member.hobbies])))

  const accessibilityNeeds = Array.from(
    new Set(members.map((member) => member.accessibility).filter((value): value is string => Boolean(value)))
  )

  const travelValues = members.map((member) => member.travelKm).filter((value): value is number => value != null)
  const budgetValues = members.map((member) => member.budgetAud).filter((value): value is number => value != null)
  const budgetAud = budgetValues.length > 0 ? Math.min(...budgetValues) : DEFAULT_BUDGET_AUD
  const travelKm = travelValues.length > 0 ? Math.min(...travelValues) : DEFAULT_TRAVEL_KM

  const locatedMembers = members.filter(
    (member): member is MemberProfileInput & { areaLat: number; areaLng: number } =>
      member.areaLat != null && member.areaLng != null
  )
  const center =
    locatedMembers.length > 0
      ? {
          lat: locatedMembers.reduce((sum, member) => sum + member.areaLat, 0) / locatedMembers.length,
          lng: locatedMembers.reduce((sum, member) => sum + member.areaLng, 0) / locatedMembers.length,
        }
      : options.fallbackCenter

  return {
    interests,
    center,
    budgetAud,
    travelKm,
    groupSize: options.groupSize,
    accessibilityNeeds: accessibilityNeeds.length > 0 ? accessibilityNeeds : undefined,
    allowedCategories: options.allowedCategories,
  }
}
