// POST /api/concierge: interprets a free-text concierge prompt, runs the
// real deterministic matcher + venue agent to build a preview, and explains
// it — without persisting anything. "Lock it in" on the client calls the
// existing, unmodified POST /api/match to actually commit.
import { z } from "zod"
import { getAdminSupabase } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/current-user"
import { buildMatch, describeGenderMix, GROUP_MIN, GROUP_MAX } from "@/lib/matcher/match"
import { loadMatchInputs, type MatchPoolMember, activitySignalsAllowed } from "@/lib/matcher/loadPool"
import { interpretIntent, ConciergeIntentError } from "@/lib/concierge/intent"
import { synthesizeExplanation } from "@/lib/concierge/synthesize"
import { buildGroupProfileFromMembers, type MemberProfileInput } from "@/lib/venue-agent/groupProfile"
import { runVenueAgent } from "@/lib/venue-agent/agent"

const ConciergeRequestSchema = z.object({ text: z.string().trim().min(1).max(500) })

interface ConciergePreviewResponse {
  status: "preview"
  intentSummary: string
  groupSize: number
  genderMix: string
  sharedInterestReasons: string[]
  venue: { name: string; reason: string; distanceKm: number; mapsUrl: string | null }
  explanation: string
  opener: string
  controls: {
    maxDurationMin: number
    socialEnergy: "low" | "medium" | "high" | null
    proposedActivity: string | null
    travelKm: number | null
    budgetAud: number | null
  }
}

interface ConciergeInsufficientResponse {
  status: "insufficient"
}

function clampTargetSize(groupSizeHint: number | null): number | undefined {
  if (groupSizeHint == null) return undefined
  return Math.min(Math.max(groupSizeHint + 1, GROUP_MIN), GROUP_MAX)
}

export async function POST(request: Request): Promise<Response> {
  let rawBody: unknown
  try {
    rawBody = await request.json()
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const parsedBody = ConciergeRequestSchema.safeParse(rawBody)
  if (!parsedBody.success) {
    return Response.json({ error: "Invalid concierge request", issues: parsedBody.error.issues }, { status: 400 })
  }

  const currentUser = await getCurrentUser()
  if (!currentUser) {
    return Response.json({ error: "Unauthenticated" }, { status: 401 })
  }

  if (!activitySignalsAllowed([parsedBody.data.text])) {
    const response: ConciergeInsufficientResponse = { status: "insufficient" }
    return Response.json(response)
  }

  let intent
  try {
    intent = await interpretIntent(parsedBody.data.text)
  } catch (err) {
    if (err instanceof ConciergeIntentError) {
      return Response.json({ error: err.message }, { status: 422 })
    }
    throw err
  }

  const now = new Date()
  const endAt = new Date(now.getTime() + intent.maxDurationMin * 60_000)
  const supabase = getAdminSupabase()

  let activeUser, pool: MatchPoolMember[], blockedPairs
  try {
    ;({ activeUser, pool, blockedPairs } = await loadMatchInputs(supabase, currentUser.id, {
      socialEnergy: intent.socialEnergy ?? undefined,
      proposedActivity: intent.proposedActivity,
      availability: [{ startAt: now.toISOString(), endAt: endAt.toISOString(), mode: "im_free" }],
    }))
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Failed to load match inputs" }, { status: 404 })
  }

  const targetSize = clampTargetSize(intent.groupSizeHint)
  let result = buildMatch(activeUser, pool, { blockedPairs, now, targetSize })

  // Same demo-seed fallback /api/match already uses: stale seed availability
  // windows can wipe the pool for the sessionless demo user.
  if (result.status === "insufficient" && currentUser.isDemo) {
    result = buildMatch(activeUser, pool, { blockedPairs, now, targetSize, relaxAvailability: true })
  }

  if (result.status === "insufficient") {
    const response: ConciergeInsufficientResponse = { status: "insufficient" }
    return Response.json(response)
  }

  const poolById = new Map(pool.map((member) => [member.id, member]))
  const matchedMembers = result.members
    .map((member) => poolById.get(member.userId))
    .filter((member): member is MatchPoolMember => !!member)

  const groupProfileMembers: MemberProfileInput[] = [activeUser, ...matchedMembers]
  const group = buildGroupProfileFromMembers(groupProfileMembers, {
    fallbackCenter: { lat: activeUser.areaLat ?? 0, lng: activeUser.areaLng ?? 0 },
    groupSize: groupProfileMembers.length,
    allowedCategories: intent.proposedActivity ? [intent.proposedActivity] : undefined,
  })

  const venueResult = await runVenueAgent(group)

  const synthesis = await synthesizeExplanation({
    groupSize: groupProfileMembers.length,
    sharedInterestReasons: result.explanation,
    venueName: venueResult.recommendation.venueName,
    distanceKm: venueResult.recommendation.estimatedDistanceKm,
    maxDurationMin: intent.maxDurationMin,
    activityTitle: venueResult.recommendation.activityTitle,
  })

  const response: ConciergePreviewResponse = {
    status: "preview",
    intentSummary: intent.moodSummary,
    groupSize: groupProfileMembers.length,
    genderMix: describeGenderMix([activeUser.gender, ...matchedMembers.map((member) => member.gender)]),
    sharedInterestReasons: result.explanation,
    venue: {
      name: venueResult.recommendation.venueName,
      reason: venueResult.recommendation.reason,
      distanceKm: venueResult.recommendation.estimatedDistanceKm,
      mapsUrl: venueResult.recommendation.bookingUrl,
    },
    explanation: synthesis.explanation,
    opener: synthesis.opener,
    controls: {
      maxDurationMin: intent.maxDurationMin,
      socialEnergy: intent.socialEnergy,
      proposedActivity: intent.proposedActivity,
      travelKm: activeUser.travelKm,
      budgetAud: activeUser.budgetAud,
    },
  }
  return Response.json(response)
}
