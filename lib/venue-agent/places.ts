// Server-only module: calls Google Places API (New) with the secret
// GOOGLE_PLACES_API_KEY. Never import this into a client component —
// the `server-only` package isn't installed in this repo (see task-3.2
// report), so this boundary is enforced by convention, not by tooling.

import { PLACES_ENDPOINTS, PLACES_FIELD_MASK, getEnv } from "@/lib/config"

export interface PlaceCandidate {
  placeId: string
  name: string
  address: string
  location: { lat: number; lng: number }
  openNow: boolean | null
  priceLevel: string | number | null
  website: string | null
  mapsUrl: string | null
  accessibility: object | null
}

export type PlaceDetail = PlaceCandidate

export class PlacesApiError extends Error {
  constructor(
    public readonly endpoint: string,
    public readonly status: number,
    public readonly body: string
  ) {
    super(`Places API request to ${endpoint} failed with ${status}: ${body}`)
    this.name = "PlacesApiError"
  }
}

interface RawPlace {
  id?: string
  displayName?: { text?: string }
  formattedAddress?: string
  location?: { latitude?: number; longitude?: number }
  currentOpeningHours?: { openNow?: boolean }
  priceLevel?: string | number
  websiteUri?: string
  googleMapsUri?: string
  accessibilityOptions?: object
}

function normalizePlace(raw: RawPlace): PlaceCandidate {
  return {
    placeId: raw.id ?? "",
    name: raw.displayName?.text ?? "",
    address: raw.formattedAddress ?? "",
    location: {
      lat: raw.location?.latitude ?? 0,
      lng: raw.location?.longitude ?? 0,
    },
    openNow: raw.currentOpeningHours?.openNow ?? null,
    priceLevel: raw.priceLevel ?? null,
    website: raw.websiteUri ?? null,
    mapsUrl: raw.googleMapsUri ?? null,
    accessibility: raw.accessibilityOptions ?? null,
  }
}

export interface PlacesTextSearchOptions {
  lat?: number
  lng?: number
  radiusM?: number
  maxResults?: number
}

export async function placesTextSearch(
  query: string,
  opts: PlacesTextSearchOptions = {}
): Promise<PlaceCandidate[]> {
  const body: Record<string, unknown> = { textQuery: query }

  if (opts.lat !== undefined && opts.lng !== undefined) {
    body.locationBias = {
      circle: {
        center: { latitude: opts.lat, longitude: opts.lng },
        radius: opts.radiusM ?? 5000,
      },
    }
  }

  if (opts.maxResults !== undefined) {
    body.maxResultCount = opts.maxResults
  }

  const response = await fetch(PLACES_ENDPOINTS.textSearch, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": getEnv("GOOGLE_PLACES_API_KEY"),
      "X-Goog-FieldMask": PLACES_FIELD_MASK.search,
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    throw new PlacesApiError(PLACES_ENDPOINTS.textSearch, response.status, await response.text())
  }

  const data: { places?: RawPlace[] } = await response.json()
  const candidates = (data.places ?? []).map(normalizePlace)

  // PRD §9.8: closed venues are rejected. Only the *definitively* closed
  // (openNow === false) are dropped — unknown open status is kept.
  return candidates.filter((candidate) => candidate.openNow !== false)
}

export async function placeDetails(placeId: string): Promise<PlaceDetail> {
  const endpoint = `${PLACES_ENDPOINTS.details}/${placeId}`

  const response = await fetch(endpoint, {
    method: "GET",
    headers: {
      "X-Goog-Api-Key": getEnv("GOOGLE_PLACES_API_KEY"),
      "X-Goog-FieldMask": PLACES_FIELD_MASK.details,
    },
  })

  if (!response.ok) {
    throw new PlacesApiError(endpoint, response.status, await response.text())
  }

  const raw: RawPlace = await response.json()
  return normalizePlace(raw)
}
