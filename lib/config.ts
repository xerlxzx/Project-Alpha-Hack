/**
 * Pinned external identifiers and shared config for the venue agent,
 * matcher, and server routes. No secret values live here. See
 * `.env.example` / `REQUIRED_ENV` for what the environment must provide.
 */

export const GEMINI_MODEL = "gemini-3.7-flash"

export const PLACES_ENDPOINTS = {
  textSearch: "https://places.googleapis.com/v1/places:searchText",
  nearby: "https://places.googleapis.com/v1/places:searchNearby",
  // Place Details (New) takes the place ID as a path segment: `${details}/${placeId}`.
  details: "https://places.googleapis.com/v1/places",
} as const

// Text Search / Nearby Search responses are a `places[]` array, so their
// field mask entries need the `places.` prefix. Place Details returns a
// single Place, so its mask uses bare field names. Same §9.8 field set,
// two required formats. See task-0.2-report.md for the source docs.
export const PLACES_FIELD_MASK = {
  search:
    "places.id,places.displayName,places.formattedAddress,places.location,places.currentOpeningHours,places.priceLevel,places.websiteUri,places.googleMapsUri,places.accessibilityOptions,places.businessStatus,places.photos",
  details:
    "id,displayName,formattedAddress,location,currentOpeningHours,priceLevel,websiteUri,googleMapsUri,accessibilityOptions,businessStatus,photos",
} as const

// Weights must sum to 1.00.
export const MATCH_WEIGHTS = {
  sharedInterests: 0.3,
  availabilityOverlap: 0.2,
  travelPracticality: 0.15,
  budgetFit: 0.1,
  socialGroupFit: 0.1,
  previousFeedback: 0.1,
  privateReliability: 0.05,
} as const

export const EXPLORATION_POLICY = {
  initial: { familiar: 0.9, exploratory: 0.1 },
  afterThreeMeetups: { familiar: 0.7, exploratory: 0.3 },
} as const

export const REQUIRED_ENV = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "GEMINI_API_KEY",
  "GOOGLE_PLACES_API_KEY",
] as const

export type RequiredEnvName = (typeof REQUIRED_ENV)[number]

export function getEnv(name: RequiredEnvName): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}
