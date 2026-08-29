// Pre-acceptance disclosure fields only. No names, photos, contact info,
// exact location, reliability, or reports — shared by every route that shows
// a candidate before they've accepted (app/api/match, app/api/concierge).
export interface AnonymisedMember {
  verified: boolean
  ageRange: string | null
  sharedInterests: string[]
}

export function sharedInterestsOf(
  activeUser: { interests: string[]; hobbies: string[] },
  candidate: { interests: string[]; hobbies: string[] }
): string[] {
  const candidateSignals = new Set([...candidate.interests, ...candidate.hobbies])
  const activeSignals = [...new Set([...activeUser.interests, ...activeUser.hobbies])]
  return activeSignals.filter((signal) => candidateSignals.has(signal))
}
