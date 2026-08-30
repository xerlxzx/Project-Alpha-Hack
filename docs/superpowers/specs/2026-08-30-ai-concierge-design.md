# AI Concierge: Design Spec

Date: 2026-08-30
Status: Approved, implemented on branch `ai-concierge`

## Problem

The home page's hero has a free-text "concierge" input box (already shipped as
UI-only, see `app/(app)/home/page.tsx`'s `ConciergeBox`). Today, submitting it
just shows a "still warming up" placeholder message. This spec covers wiring
it to a real feature: the user types something like *"I'm tired, have 90
minutes, don't want anything intense, and want to meet two people near
campus"*, and the concierge interprets that, finds a real matching group and
venue, explains why, and drafts an opening message for the group chat, all
before committing to anything.

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
  already exists (e.g. a second "compute a match" or "get a group profile"
  implementation), extract and share instead.

## Decisions (confirmed with the user)

1. **Anonymized explanation.** The concierge's explanation never names
   candidates pre-acceptance ("two people nearby who both prefer low-pressure
   study sessions", not "Maya and Jordan"). Names appear later exactly the way
   they already do today, once a candidate accepts.
2. **Preview, then explicit confirm.** Submitting a concierge prompt runs the
   real deterministic matcher and venue agent to build a genuine preview card,
   but writes nothing to the database and notifies no one until the user taps
   a separate "Lock it in" action.
3. **Group size is a clamped hint.** A parsed group-size request (e.g. "meet
   two people") is honored by clamping into the existing
   `[GROUP_MIN, GROUP_MAX]` = `[3, 6]` range. If the pool can't fill even the
   minimum, the existing "insufficient" state/copy is shown.
4. **Single-shot pipeline.** One free-text submission runs
   interpret → rank → recommend → explain → draft opener in one pass and
   renders one result card. No multi-turn clarification chat in this pass.
5. **Previewed venue is illustrative, not carried through.** This app already
   defers real venue selection until after a group accepts
   (`app/api/venue-agent/route.ts`, triggered post-acceptance). "Lock it in"
   reuses the existing `/api/match` flow unchanged; it does not try to force
   the previewed venue to be the one that's ultimately booked. The real,
   post-acceptance venue-agent run may occasionally pick a different venue
   than the preview did. This keeps the accepted-meetup venue flow completely
   untouched.

## Architecture

Reuse the existing deterministic pipeline via a preview/confirm split, adding
a thin Gemini interpretation layer before it and a synthesis layer after it.
No parallel matching implementation.

```
ConciergeBox (client)
  -> POST /api/concierge { text }
       1. interpretIntent(text)                [Gemini, Zod-validated, 1 retry]
       2. targetSize = intent.groupSizeHint == null ? undefined
                        : clamp(intent.groupSizeHint + 1, GROUP_MIN, GROUP_MAX)
          loadMatchInputs + buildMatch(..., targetSize)   [existing, pure, unchanged shape]
            -> insufficient? return existing insufficient shape
            -> ready? continue
       3. buildGroupProfileFromMembers(activeUser, matchedMembers)  [new shared helper, in-memory]
       4. runVenueAgent(group)                  [existing, unchanged]
       5. synthesize(facts)                     [Gemini, Zod-validated, template fallback]
       <- ConciergePreview (anonymized, nothing persisted)
  -> renders preview card: "Lock it in" | "Never mind"
       "Lock it in" -> POST /api/match (existing, unchanged) with the same
                        derived duration/energy/activity/groupSizeHint
                     -> router.push /match?meetupId=...  (existing flow)
```

### New files

- `lib/concierge/schema.ts`: `ConciergeIntentSchema`, `ConciergeSynthesisSchema` (Zod).
- `lib/concierge/intent.ts`: `interpretIntent(text, deps)` builds the Gemini
  prompt, validates the JSON response against `ConciergeIntentSchema`. One
  retry on failure, then throws a typed error the route turns into a clear
  "couldn't understand that, try rephrasing" response. Never guesses.
- `lib/concierge/synthesize.ts`: `synthesizeExplanation(facts, deps)` runs one
  Gemini call fed *only* already-computed deterministic facts (shared-interest
  reasons, group size, venue name/reason/distance, duration, mood summary).
  Prompt explicitly forbids introducing any fact not present in the input. On
  failure, falls back to a fixed template built directly from `facts`. This
  step must never block the preview.
- `lib/ai/generateJson.ts`: extraction of the small "call Gemini, parse JSON,
  validate against a Zod schema" helper currently inlined in
  `lib/venue-agent/agent.ts`'s `buildDefaultDeps`, so `interpretIntent` and
  `synthesizeExplanation` share it instead of re-implementing GoogleGenAI
  wiring a third time.
- `lib/matcher/anonymize.ts`: extraction of `AnonymisedMember` and
  `sharedInterestsOf` out of `app/api/match/route.ts` so `/api/concierge`
  reuses the exact same anonymization instead of a parallel copy.
- `lib/venue-agent/groupProfile.ts`: extraction of the aggregation logic
  inside `app/api/venue-agent/route.ts`'s `buildGroupProfileForMeetup` into a
  pure `buildGroupProfileFromMembers(members, options)` helper. The existing
  DB-backed function becomes a thin wrapper: load rows, then call the shared
  pure helper. The concierge preview calls the same pure helper directly on
  data it already has in memory (no extra DB round-trip).
- `app/api/concierge/route.ts`: orchestrates the flow above.

### Changed files

- `lib/matcher/match.ts`: `buildMatch` gains an optional `targetSize`
  parameter, clamped to `[GROUP_MIN, GROUP_MAX]`, defaulting to the current
  `GROUP_TARGET` so every existing caller is unaffected.
- `app/api/match/route.ts`: imports `AnonymisedMember`/`sharedInterestsOf`
  from `lib/matcher/anonymize.ts` instead of defining them locally (no
  behavior change).
- `app/api/venue-agent/route.ts`: `buildGroupProfileForMeetup` becomes a thin
  wrapper around the new shared `buildGroupProfileFromMembers` (no behavior
  change).
- `app/(app)/home/page.tsx`: `ConciergeBox` actually calls `/api/concierge`
  on submit; shows a loading state while the request is in flight; renders the
  returned preview as a card (reusing `GlassPanel`) with "Lock it in" (calls
  the same `startMatch` already defined on the page, with controls derived
  from the parsed intent) and "Never mind" (discards the preview, clears the
  input).

## Data contracts

```ts
// lib/concierge/schema.ts
ConciergeIntentSchema = z.object({
  moodSummary: z.string(),          // short paraphrase, e.g. "low-energy, wants something calm"
  maxDurationMin: z.number().int().positive(),
  groupSizeHint: z.number().int().min(1).max(5).nullable(), // "other people", not counting the user
  proposedActivity: z.string().nullable(),
  socialEnergy: z.enum(["low", "medium", "high"]).nullable(),
})
// groupSizeHint -> buildMatch's targetSize is `groupSizeHint + 1` (self
// included), clamped to [GROUP_MIN, GROUP_MAX] = [3, 6]. `null` means no
// preference, so targetSize is omitted and buildMatch uses its own default.
//
// No start-time field: the concierge always means "I'm free right now" (same
// semantics as the page's existing "im_free" mode / StartChoice "now"),
// consistent with every example in this spec. A user who wants to plan ahead
// already has the existing "Plan ahead" sheet for that — the concierge isn't
// a second path for scheduling.

ConciergeSynthesisSchema = z.object({
  explanation: z.string(),
  opener: z.string(),
})
```

```ts
// app/api/concierge/route.ts response shape
interface ConciergePreview {
  status: "preview"
  intentSummary: string
  groupSize: number
  genderMix: string
  sharedInterestReasons: string[]   // same shape as today's ReadyResponse.explanation
  venue: { name: string; reason: string; distanceKm: number; mapsUrl: string | null }
  explanation: string
  opener: string
  // everything needed for "Lock it in" to call the real /api/match unchanged
  // (startAt is always "now", per the no-start-time-field note above):
  controls: { maxDurationMin: number; socialEnergy: string | null; proposedActivity: string | null }
}
// insufficient pool: reuses the existing InsufficientResponse shape as-is.
```

## Error handling

- Intent interpretation fails twice → `422`-style error, UI shows "Couldn't
  understand that, try rephrasing" with a retry action (mirrors the existing
  `MatchOverlay` error state already on the page).
- Deterministic pool insufficient → existing insufficient-state UI/copy,
  unchanged.
- Venue agent fails → falls through to its existing cached fallback
  (`lib/venue-agent/fallback.ts`), already handled, no change needed here.
- Synthesis fails → deterministic template fallback built from `facts`
  directly; never surfaces as an error to the user.

## Testing

- Vitest, matching `lib/matcher/__tests__/` and `lib/venue-agent/__tests__/`
  conventions:
  - `buildMatch`'s `targetSize` clamping (below min, above max, within range,
    default unchanged).
  - `buildGroupProfileFromMembers` aggregation (union of interests/hobbies,
    budget/travel defaults, centroid).
  - `ConciergeIntentSchema` / `ConciergeSynthesisSchema` parsing and rejection
    of malformed Gemini output.
  - `synthesizeExplanation` falls back to the template when injected `deps`
    throw (same dependency-injection pattern `runVenueAgent(group, deps)`
    already uses for testability).
- Manual: `npm run dev`, mobile viewport, full submit → preview → "Lock it
  in" → `/match?meetupId=...` flow, and the "insufficient" and error paths.

## Out of scope (explicitly deferred)

- Multi-turn clarification chat.
- Making the previewed venue binding through to acceptance.
- The available/unavailable passive-matching toggle (separate spec).

## Provenance note (added post-implementation)

While finishing this feature, the on-disk copy of this spec file was
overwritten by an unrelated, independently-authored design (encrypted preview
tokens, candidate-ID pinning + `409 preview_stale`, a corrected
whole-group-inclusive `GROUP_MIN`/`GROUP_TARGET`/`GROUP_MAX` semantic, campus-
center location resolution) committed to `main` at `e004d76` by a different
Claude session. That design was never discussed with the user in the
conversation that produced this spec and this implementation. The user was
asked and explicitly chose to keep this implementation as authoritative for
this branch; this file was restored to match what was actually designed,
approved, and built here. Two points from that other design are worth
revisiting later regardless of which implementation ships:
- **Stale-pool race**: this implementation does not pin candidate identity
  between preview and confirm. "Lock it in" simply re-runs the real matcher
  fresh, so it can occasionally produce a different group than the one
  previewed (still safe: never a bad/unsafe match, just a possible surprise).
- **Group-size semantic ambiguity**: whether `GROUP_MIN`/`GROUP_TARGET`/
  `GROUP_MAX` should count candidates only (this codebase's existing,
  unchanged behavior, which this implementation preserves) or the whole group
  including the active user (what the other design argues is a correction) is
  a pre-existing ambiguity this implementation did not attempt to resolve.
