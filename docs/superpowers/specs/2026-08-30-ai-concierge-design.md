# AI Concierge: Design Spec

Date: 2026-08-30
Status: Approved, pending implementation plan

## Problem

The home page's hero has a free-text "concierge" input box (already shipped as
UI-only, see `app/(app)/home/page.tsx`'s `ConciergeBox`). Today, submitting it
shows a "still warming up" placeholder message. This spec wires it to a real
feature. A user can type *"I'm tired, have 90 minutes, don't want anything
intense, and want to meet two people near campus."* The concierge interprets
the request, finds a matching group and venue, explains the match, and drafts
an opening message before the user commits.

## Constraints from the existing codebase

- **Three-layer split** (`AGENTS.md`/`CLAUDE.md`): deterministic TypeScript
  owns eligibility/safety/quorum/scoring; Gemini only turns free text into
  structured data and explains/ranks *within* candidates that already passed
  deterministic checks. Gemini must never decide who is safe/eligible to
  match, and must never invent a venue or person not already produced by the
  deterministic pipeline or Google Places.
- **Pre-acceptance privacy** (`app/api/match/route.ts`'s `AnonymisedMember`):
  no names, photos, contact info, exact location, reliability, or reports are
  disclosed before a candidate accepts. This is a hard existing boundary, not
  a default to relax for this feature.
- **No second ad-hoc path** (`CLAUDE.md`): don't duplicate a mechanism that
  exists, such as a second "compute a match" or "get a group profile"
  implementation. Extract and share the existing mechanism.

## Resolved decisions

1. **Anonymized explanation.** The concierge does not name candidates before
   acceptance. It can say "two people nearby who prefer low-pressure study
   sessions." Names appear through the existing reveal flow after acceptance.
2. **A preview binds to one group.** The preview route writes no domain rows
   and sends no notifications. It returns an encrypted, authenticated token
   that contains the normalized request and ordered candidate IDs. The token
   expires after five minutes. "Lock it in" revalidates those candidates. A
   changed pool produces `409 preview_stale` before any write.
3. **Group-size values include the active user.** `GROUP_MIN = 3`,
   `GROUP_TARGET = 4`, and `GROUP_MAX = 6` describe the whole group. A request
   to "meet two people" produces a target group size of three. `buildMatch`
   selects `targetGroupSize - 1` candidates and reports insufficient when
   fewer than `GROUP_MIN - 1` candidates pass the gates. This corrects the
   current implementation, which treats the constants as candidate counts.
4. **The concierge supports bounded place, travel, and budget intent.**
   `locationMode: "profile_area"` uses the user's saved area.
   `locationMode: "campus"` uses a deterministic campus-center allowlist
   keyed by the user's university. The interpreter marks other named places as
   `"unsupported"`. The route returns `422 unsupported_location` for an
   unknown campus or unsupported place. The model cannot supply coordinates.
5. **The requested activity reaches venue search.** Deterministic code checks
   the activity policy. The venue agent receives the accepted activity text as
   an explicit `activityIntent` after that check.
6. **The pipeline stays single-shot.** One free-text submission interprets,
   matches, recommends, explains, and drafts an opener. This version does not
   add a clarification chat.
7. **The venue remains illustrative.** Confirmation pins the group and request
   constraints, but the post-acceptance Places search can select another venue.
   Both searches use the same activity, center, travel, budget, and
   accessibility constraints.
8. **Fallback venues carry a label.** A live Places result appears as
   "Recommended venue." A cached fallback appears as "Example nearby option."

## Architecture

The preview and confirmation routes share the matcher, presentation helpers,
and persistence function.

```
ConciergeBox (client)
  -> POST /api/concierge { text }
       1. validate text length and resolve the current user
       2. interpretIntent(text)                    [Gemini, Zod, one retry]
       3. normalizeIntent(intent, user)
            - apply documented defaults
            - resolve profile/campus center in TypeScript
            - reject unsupported campus values
       4. loadMatchInputs + buildMatch(..., targetGroupSize)
            - insufficient -> loadInsufficientContext()
            - ready -> continue with the ordered candidate IDs
       5. buildGroupProfileFromMembers(allMembers, options)
       6. runVenueAgent(group)
       7. synthesizeExplanation(allowlistedFacts)
       8. sealPreviewToken({
            userId, expiresAt, normalizedRequest, candidateIds,
            venueConstraints
          })                                      [AES-256-GCM]
       <- ConciergePreview                         [no domain write]

  -> renders preview card: "Lock it in" | "Never mind"

       "Lock it in" -> POST /api/match { previewToken }
            1. resolve current user
            2. decrypt token; check version, expiry, and userId
            3. reload inputs with token.normalizedRequest
            4. rerun buildMatch with token targetGroupSize
            5. compare ordered candidate IDs
                 mismatch -> 409 preview_stale, no write
                 match    -> persistMatch() in one database transaction
            6. return the existing ReadyResponse
          -> router.push /match?meetupId=...
```

The direct home-page match flow keeps accepting `MatchRequestSchema`. The
`/api/match` route also accepts the separate strict
`PreviewConfirmationSchema`. A client cannot mix fields from both schemas.
The confirmation path ignores client-supplied controls because the encrypted
token carries the normalized request.

`persistMatch()` calls one Supabase RPC that creates the meetup and its
membership rows in one transaction. Both the direct match path and concierge
confirmation use it. Concierge confirmation stores the preview's center,
budget, and travel limit on the meetup. It stores `proposedActivity` in
`meetups.activity_intent`. The RPC prevents an orphan meetup when a member
insert fails.

### New files

- `lib/concierge/schema.ts`: intent, synthesis, normalized-request, preview,
  and token-payload schemas.
- `lib/concierge/intent.ts`: builds the Gemini prompt and validates the
  response. It retries once after malformed output, then throws
  `ConciergeInterpretationError`.
- `lib/concierge/normalize.ts`: applies defaults, resolves the requested
  center, and produces `NormalizedConciergeRequest`.
- `lib/concierge/location.ts`: owns `CAMPUS_CENTERS` and resolves a campus
  from the authenticated user's university. It accepts no coordinates from
  the model or browser.
- `lib/concierge/previewToken.ts`: seals and opens versioned preview tokens
  with AES-256-GCM and `CONCIERGE_PREVIEW_SECRET`. Tokens expose no candidate
  IDs as readable client data.
- `lib/concierge/synthesize.ts`: sends allowlisted facts to Gemini. It uses a
  fixed template when generation or validation fails.
- `lib/ai/generateJson.ts`: extracts the Gemini JSON generation and Zod
  validation code from `lib/venue-agent/agent.ts`.
- `lib/matcher/presentation.ts`: owns `AnonymisedMember`,
  `sharedInterestsOf`, and the response builders used by both routes. Public
  explanations use shared interests, availability, travel, and budget facts.
  They exclude reliability, reports, feedback, and score breakdowns.
- `lib/matcher/insufficient.ts`: owns the shared nearest-future and seeded
  suggestion queries.
- `lib/matcher/persist.ts`: calls the transactional match-persistence RPC and
  returns the existing ready response data.
- `lib/venue-agent/groupProfile.ts`: exports
  `buildGroupProfileFromMembers(members, options)`.
- `app/api/concierge/route.ts`: orchestrates preview generation.
- `supabase/migrations/00xx_concierge_confirmation.sql`: adds nullable
  `venue_budget_aud` and `venue_travel_km` meetup columns plus the
  transaction used by `persistMatch()`.

### Changed files

- `lib/matcher/match.ts`: exports the group-size constants, treats them as
  whole-group sizes, accepts `targetGroupSize`, and breaks score ties by user
  ID so preview and confirmation produce a stable order.
- `lib/matcher/loadPool.ts`: accepts a server-created center override for the
  active user. `MatchRequestSchema` does not expose raw coordinates.
- `lib/matcher/request.ts`: keeps `MatchRequestSchema` and adds a separate
  strict `PreviewConfirmationSchema`.
- `app/api/match/route.ts`: dispatches between direct matching and token
  confirmation, then uses the shared presentation, insufficient, and
  persistence helpers.
- `lib/venue-agent/agent.ts`: adds `activityIntent` to `GroupProfile`, uses
  it in the search-plan prompt, and retains `mapsUrl` from Place Details.
- `lib/venue-agent/schema.ts` and `lib/venue-agent/fallback.ts`: add the
  nullable `mapsUrl` field.
- `app/api/venue-agent/route.ts`: loads `activity_intent`, meetup tags,
  center, `venue_budget_aud`, and `venue_travel_km`, then calls the shared
  group-profile helper. Stored concierge constraints take precedence. Member
  aggregation remains the fallback for existing and direct-match meetups.
- `app/(app)/home/page.tsx`: keeps `startMatch` for the current controls.
  `ConciergeBox` owns a separate preview state and posts `previewToken` when
  the user chooses "Lock it in." "Never mind" drops the token and clears the
  input.
- `lib/config.ts` and `.env.example`: add
  `CONCIERGE_PREVIEW_SECRET` as a base64-encoded 32-byte key.

## Data contracts

```ts
// lib/concierge/schema.ts
ConciergeRequestSchema = z.object({
  text: z.string().trim().min(1).max(500),
}).strict()

ConciergeIntentSchema = z.object({
  moodSummary: z.string().trim().min(1).max(160),
  maxDurationMin: z.number().int().min(30).max(240).nullable(),
  groupSizeHint: z.number().int().min(1).max(5).nullable(), // "other people", not counting the user
  proposedActivity: z.string().trim().min(1).max(120).nullable(),
  socialEnergy: z.enum(["low", "medium", "high"]).nullable(),
  startMode: z.enum(["now", "future"]),
  locationMode: z.enum(["profile_area", "campus", "unsupported"]).nullable(),
  maxTravelKm: z.number().min(1).max(30).nullable(),
  maxBudgetAud: z.number().min(0).max(1000).nullable(),
})
//
// normalizeIntent applies these rules:
// - null maxDurationMin -> 120
// - null groupSizeHint -> GROUP_TARGET
// - groupSizeHint + 1 -> clamp to [GROUP_MIN, GROUP_MAX]
// - null socialEnergy/travel/budget -> retain the saved preference
// - null locationMode -> "profile_area"
// - "campus" -> resolve from CAMPUS_CENTERS by the user's university
// - "unsupported" -> 422 unsupported_location
// - startMode "future" -> 422 unsupported_time_constraint
// - an activity rejected by activitySignalsAllowed -> 422 unsupported_activity
// - availability starts at preview creation and uses mode "im_free"
//
// The model reports missing values as null. It does not invent defaults.
// Future-time requests remain out of scope and produce
// `422 unsupported_time_constraint`.

ConciergeSynthesisSchema = z.object({
  explanation: z.string().trim().min(1).max(500),
  opener: z.string().trim().min(1).max(500),
})

NormalizedConciergeRequestSchema = z.object({
  availability: z.tuple([z.object({
    startAt: z.iso.datetime({ offset: true }),
    endAt: z.iso.datetime({ offset: true }),
    mode: z.literal("im_free"),
  })]),
  targetGroupSize: z.number().int().min(GROUP_MIN).max(GROUP_MAX),
  travelKm: z.number().min(1).max(30).nullable(),
  budgetAud: z.number().min(0).max(1000).nullable(),
  socialEnergy: z.enum(["low", "medium", "high"]).nullable(),
  proposedActivity: z.string().trim().min(1).max(120).nullable(),
  preferredCenter: z.object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
  }),
})

PreviewTokenPayloadSchema = z.object({
  version: z.literal(1),
  userId: z.uuid(),
  issuedAt: z.iso.datetime({ offset: true }),
  expiresAt: z.iso.datetime({ offset: true }),
  normalizedRequest: NormalizedConciergeRequestSchema,
  candidateIds: z.array(z.uuid()).min(GROUP_MIN - 1).max(GROUP_MAX - 1),
  venueConstraints: z.object({
    center: z.object({
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
    }),
    budgetAud: z.number().min(0).max(1000),
    travelKm: z.number().min(1).max(30),
    activityIntent: z.string().trim().min(1).max(120).nullable(),
  }),
  relaxAvailability: z.boolean(),
})
```

```ts
// app/api/concierge/route.ts response shape
interface ConciergePreview {
  status: "preview"
  previewToken: string
  expiresAt: string
  intentSummary: string
  groupSize: number
  genderMix: string
  sharedInterestReasons: string[]
  venue: {
    name: string
    reason: string
    distanceKm: number
    mapsUrl: string | null
    source: "live" | "fallback"
  }
  explanation: string
  opener: string
}
// insufficient pool: reuses the existing InsufficientResponse shape as-is.

// app/api/match/route.ts confirmation request
PreviewConfirmationSchema = z.object({
  previewToken: z.string().min(1).max(8192),
}).strict()
```

The serialized preview contains no candidate IDs outside the encrypted token.
It also excludes names, photos, contact details, exact member locations,
reliability, reports, and score breakdowns. Synthesis receives the same
allowlist plus venue facts and the normalized user intent.

## Error handling

- Invalid JSON, blank text, or text over 500 characters returns `400`.
- A missing current user returns `401`.
- Two failed intent parses return `422 cannot_interpret`.
- Unknown campus and future-time constraints return a specific `422` code.
- An insufficient pool returns the shared insufficient response.
- The venue agent uses its retry and cached fallback. The preview exposes the
  fallback source so the UI can label it.
- Synthesis failure uses the deterministic template.
- A malformed, tampered, or wrong-version token returns `400 invalid_preview`.
- An expired token returns `410 preview_expired`; a user mismatch returns
  `403 preview_owner_mismatch`.
- A confirmation whose ordered candidate IDs no longer match returns
  `409 preview_stale`. The UI discards the token and offers "Refresh preview."
- The confirmation route performs no domain write before token and candidate
  validation pass.

## Testing

- Matcher tests cover whole-group size semantics, clamping, the default group
  of four, minimum quorum, stable tie ordering, and insufficient pools.
- Normalization tests cover null defaults, duration bounds, group-size
  conversion, saved preferences, known campuses, unknown campuses, named
  places, future-time requests, and prohibited activities.
- Token tests cover round trips, ciphertext privacy, tampering, expiry,
  versions, and wrong-user confirmation.
- Group-profile tests cover interests, budget/travel limits, accessibility,
  activity intent, preferred center, and centroid fallback.
- Venue-agent tests prove that the activity reaches the plan prompt and that
  live and fallback recommendations retain `mapsUrl` and `source`.
- Synthesis tests verify schema rejection, allowlisted facts, and the template
  fallback.
- Route tests verify authentication, input length, no preview writes,
  anonymized serialization, exact-group confirmation, stale-preview rejection,
  and no writes on each failure path.
- Persistence tests verify that the RPC creates the meetup and all member rows
  in one transaction.
- A mobile manual test covers submit, preview, confirm, stale refresh,
  insufficient pool, unknown campus, live venue, and fallback venue.

## Out of scope (explicitly deferred)

- Multi-turn clarification chat.
- Making the previewed venue binding through to acceptance.
- The available/unavailable passive-matching toggle (separate spec).
- Arbitrary place names, addresses, and model-generated coordinates.
- Future-time scheduling through the concierge. The Plan ahead sheet remains
  the scheduling path.
