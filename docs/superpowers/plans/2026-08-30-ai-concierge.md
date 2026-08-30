# AI Concierge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the home page's `ConciergeBox` free-text input to a real pipeline that interprets mood/time/activity constraints, runs the existing deterministic matcher and venue agent to build a preview recommendation, explains it and drafts an opener, and lets the user commit it via the existing `/api/match` flow.

**Architecture:** Reuse the existing deterministic matcher (`buildMatch`) and `runVenueAgent` unchanged for the actual ranking/venue-picking. They already require no DB writes to compute a result. Add a thin Gemini interpretation layer before them and a synthesis layer after them, orchestrated by one new route (`POST /api/concierge`) that returns a preview (nothing persisted). A separate "Lock it in" action on the client calls the existing, unmodified `POST /api/match` to actually commit, with no parallel matching implementation.

**Tech Stack:** Next.js (App Router, TypeScript), `@google/genai` (Gemini), Zod, Supabase (admin client, read-only for this feature), Vitest, Framer Motion, Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-08-30-ai-concierge-design.md`

## Global Constraints

- No names, photos, contact info, exact location, reliability, or reports are ever disclosed pre-acceptance (existing rule; the concierge's explanation must never name a candidate, only refer to them by count).
- Gemini never decides eligibility/safety; only `lib/matcher/gates.ts` (existing, unmodified) does. Gemini never invents a venue or fact not already produced by the deterministic pipeline or Google Places (existing rule already enforced by `runVenueAgent`; the new synthesis step must follow the same discipline).
- The concierge always means "start now" (mirrors the existing `im_free` mode), with no scheduling path in this feature.
- `groupSizeHint` (other people, not counting the user) maps to `buildMatch`'s `targetSize` as `hint + 1`, clamped to `[GROUP_MIN, GROUP_MAX]` = `[3, 6]`.
- Zod validates every Gemini output before it's trusted anywhere downstream (existing project-wide rule, `CLAUDE.md`).
- Don't add a second ad-hoc implementation of something that already exists; extract and share instead (existing project-wide rule).
- This codebase has no `app/api/*/route.test.ts` files anywhere. API routes are verified manually (curl/browser), not with automated tests. Follow that existing convention for the new route; only `lib/` modules get Vitest unit tests.

---

### Task 1: Extract `generateJson` into a shared Gemini-JSON helper

**Files:**
- Create: `lib/ai/generateJson.ts`
- Modify: `lib/venue-agent/agent.ts` (its `buildDefaultDeps` currently inlines this)
- Test: `lib/ai/__tests__/generateJson.test.ts`

**Interfaces:**
- Produces: `generateJson(prompt: string, schema: z.ZodType): Promise<unknown>`, which calls Gemini with `responseSchema` steering, parses the JSON text response, and throws `AiJsonError` if Gemini returns no text. Does **not** validate against `schema` itself (callers do that with `schema.parse(raw)`, matching the existing `venue-agent` pattern where `deps.planSearch(group)` returns `unknown` and `agent.ts` calls `SearchPlanSchema.parse(rawPlan)` separately).
- Consumes: `GEMINI_MODEL`, `getEnv` from `@/lib/config` (existing).

- [ ] **Step 1: Write the failing test**

```typescript
// lib/ai/__tests__/generateJson.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest"
import { z } from "zod"

const generateContentMock = vi.fn()

vi.mock("@google/genai", () => ({
  GoogleGenAI: vi.fn().mockImplementation(() => ({
    models: { generateContent: generateContentMock },
  })),
}))

import { generateJson, AiJsonError } from "@/lib/ai/generateJson"

describe("generateJson", () => {
  beforeEach(() => {
    generateContentMock.mockReset()
    vi.stubEnv("GEMINI_API_KEY", "test-key")
  })

  it("parses Gemini's JSON text response", async () => {
    generateContentMock.mockResolvedValue({ text: '{"foo":"bar"}' })
    const result = await generateJson("a prompt", z.object({ foo: z.string() }))
    expect(result).toEqual({ foo: "bar" })
  })

  it("throws AiJsonError when Gemini returns no text", async () => {
    generateContentMock.mockResolvedValue({ text: undefined })
    await expect(generateJson("a prompt", z.object({}))).rejects.toBeInstanceOf(AiJsonError)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/ai/__tests__/generateJson.test.ts`
Expected: FAIL: `Cannot find module '@/lib/ai/generateJson'` (file doesn't exist yet).

- [ ] **Step 3: Write the implementation**

```typescript
// lib/ai/generateJson.ts
import { GoogleGenAI } from "@google/genai"
import { z } from "zod"
import { GEMINI_MODEL, getEnv } from "@/lib/config"

export class AiJsonError extends Error {}

// Calls Gemini with the given prompt, steering its output shape via
// `responseSchema`, and returns the parsed JSON. Does not validate the
// result against `schema` — callers own that with `schema.parse(raw)`, the
// same two-step shape lib/venue-agent/agent.ts already uses.
export async function generateJson(prompt: string, schema: z.ZodType): Promise<unknown> {
  const ai = new GoogleGenAI({ apiKey: getEnv("GEMINI_API_KEY") })
  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: z.toJSONSchema(schema),
    },
  })
  const text = response.text
  if (!text) {
    throw new AiJsonError("Gemini returned no structured output")
  }
  return JSON.parse(text)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/ai/__tests__/generateJson.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Refactor `lib/venue-agent/agent.ts` to use the shared helper**

In `lib/venue-agent/agent.ts`, remove the inline `GoogleGenAI` import and the local `generateJson` closure inside `buildDefaultDeps`, replacing them with the shared one:

```typescript
// Remove this import:
// import { GoogleGenAI } from "@google/genai"

// Add this import instead, alongside the existing lib/config import:
import { generateJson } from "@/lib/ai/generateJson"
```

Replace the whole `buildDefaultDeps` function body:

```typescript
function buildDefaultDeps(): AgentDeps {
  return {
    planSearch: (group) => generateJson(buildPlanPrompt(group), SearchPlanSchema),
    searchPlaces: (plan, group) =>
      placesTextSearch(plan.textQuery, {
        lat: group.center.lat,
        lng: group.center.lng,
        radiusM: plan.radiusM,
      }),
    getPlaceDetails: (placeId) => placeDetails(placeId),
    rankCandidates: (candidates, group, plan) => generateJson(buildRankPrompt(candidates, group, plan), RankResultSchema),
  }
}
```

This deletes the old local `async function generateJson(...)` entirely, since it's now imported. `GEMINI_MODEL` and `getEnv` were only used by that local function, so they are now unused in `agent.ts`: remove `import { GEMINI_MODEL, getEnv } from "@/lib/config"` from `agent.ts` entirely (its only other import from `@/lib/config` was this one line).

- [ ] **Step 6: Run the full existing venue-agent test suite to confirm no regression**

Run: `npx vitest run lib/venue-agent/__tests__/validation.test.ts`
Expected: PASS (all existing tests still pass since they inject their own `AgentDeps` and never exercise `buildDefaultDeps`, so this refactor doesn't change their behavior).

- [ ] **Step 7: Lint**

Run: `npm run lint`
Expected: no new errors (fixes any unused-import warning from Step 5).

- [ ] **Step 8: Commit**

```bash
git add lib/ai/generateJson.ts lib/ai/__tests__/generateJson.test.ts lib/venue-agent/agent.ts
git commit -m "refactor: extract shared generateJson helper from venue-agent"
```

---

### Task 2: Extract `lib/matcher/anonymize.ts`

**Files:**
- Create: `lib/matcher/anonymize.ts`
- Modify: `app/api/match/route.ts` (currently defines `AnonymisedMember`/`sharedInterestsOf` locally)
- Test: `lib/matcher/__tests__/anonymize.test.ts`

**Interfaces:**
- Produces: `interface AnonymisedMember { verified: boolean; ageRange: string | null; sharedInterests: string[] }`, `function sharedInterestsOf(activeUser: { interests: string[]; hobbies: string[] }, candidate: { interests: string[]; hobbies: string[] }): string[]`.

- [ ] **Step 1: Write the failing test**

```typescript
// lib/matcher/__tests__/anonymize.test.ts
import { describe, expect, it } from "vitest"
import { sharedInterestsOf } from "@/lib/matcher/anonymize"

describe("sharedInterestsOf", () => {
  it("returns the intersection of interests+hobbies, deduplicated", () => {
    const activeUser = { interests: ["coffee", "music"], hobbies: ["hiking", "coffee"] }
    const candidate = { interests: ["coffee"], hobbies: ["climbing", "music"] }
    expect(sharedInterestsOf(activeUser, candidate)).toEqual(["coffee", "music"])
  })

  it("returns an empty array when nothing overlaps", () => {
    const activeUser = { interests: ["coffee"], hobbies: [] }
    const candidate = { interests: ["skydiving"], hobbies: [] }
    expect(sharedInterestsOf(activeUser, candidate)).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/matcher/__tests__/anonymize.test.ts`
Expected: FAIL: `Cannot find module '@/lib/matcher/anonymize'`

- [ ] **Step 3: Write the implementation**

```typescript
// lib/matcher/anonymize.ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/matcher/__tests__/anonymize.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Update `app/api/match/route.ts` to import instead of defining locally**

Remove the local definitions:

```typescript
// Delete this block entirely:
// interface AnonymisedMember {
//   verified: boolean
//   ageRange: string | null
//   sharedInterests: string[]
// }
//
// function sharedInterestsOf(activeUser: { interests: string[]; hobbies: string[] }, candidate: { interests: string[]; hobbies: string[] }): string[] {
//   const candidateSignals = new Set([...candidate.interests, ...candidate.hobbies])
//   const activeSignals = [...new Set([...activeUser.interests, ...activeUser.hobbies])]
//   return activeSignals.filter((signal) => candidateSignals.has(signal))
// }
```

Add the import at the top of the file, alongside the existing imports:

```typescript
import { type AnonymisedMember, sharedInterestsOf } from "@/lib/matcher/anonymize"
```

- [ ] **Step 6: Verify no regression**

Run: `npm test`
Expected: all existing tests still pass (this route has no dedicated test file, so confirm the whole suite is green and, if a dev server is running, `curl -X POST localhost:3000/api/match` still returns the same shape it did before).

- [ ] **Step 7: Lint**

Run: `npm run lint`
Expected: no new errors.

- [ ] **Step 8: Commit**

```bash
git add lib/matcher/anonymize.ts lib/matcher/__tests__/anonymize.test.ts app/api/match/route.ts
git commit -m "refactor: extract shared AnonymisedMember/sharedInterestsOf helper"
```

---

### Task 3: Extract `lib/venue-agent/groupProfile.ts`

**Files:**
- Create: `lib/venue-agent/groupProfile.ts`
- Modify: `app/api/venue-agent/route.ts` (its `buildGroupProfileForMeetup` currently inlines this aggregation)
- Test: `lib/venue-agent/__tests__/groupProfile.test.ts`

**Interfaces:**
- Produces:
  ```typescript
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
    groupSize: number
    allowedCategories?: string[]
  }
  export function buildGroupProfileFromMembers(
    members: MemberProfileInput[],
    options: BuildGroupProfileOptions
  ): GroupProfile
  ```
  (`GroupProfile` is the existing type exported from `lib/venue-agent/agent.ts`.)
- Consumes: nothing new (pure function, no I/O).

- [ ] **Step 1: Write the failing test**

```typescript
// lib/venue-agent/__tests__/groupProfile.test.ts
import { describe, expect, it } from "vitest"
import { buildGroupProfileFromMembers, type MemberProfileInput } from "@/lib/venue-agent/groupProfile"

function makeMember(overrides: Partial<MemberProfileInput> = {}): MemberProfileInput {
  return {
    interests: ["coffee"],
    hobbies: ["hiking"],
    budgetAud: 20,
    travelKm: 10,
    areaLat: -33.888,
    areaLng: 151.187,
    accessibility: null,
    ...overrides,
  }
}

describe("buildGroupProfileFromMembers", () => {
  it("unions interests and hobbies across members, deduplicated", () => {
    const members = [
      makeMember({ interests: ["coffee"], hobbies: ["hiking"] }),
      makeMember({ interests: ["coffee", "music"], hobbies: ["boardgames"] }),
    ]
    const result = buildGroupProfileFromMembers(members, {
      fallbackCenter: { lat: 0, lng: 0 },
      groupSize: 2,
    })
    expect(result.interests.sort()).toEqual(["boardgames", "coffee", "hiking", "music"].sort())
  })

  it("takes the minimum (most restrictive) budget and travel across members", () => {
    const members = [makeMember({ budgetAud: 30, travelKm: 15 }), makeMember({ budgetAud: 10, travelKm: 5 })]
    const result = buildGroupProfileFromMembers(members, { fallbackCenter: { lat: 0, lng: 0 }, groupSize: 2 })
    expect(result.budgetAud).toBe(10)
    expect(result.travelKm).toBe(5)
  })

  it("falls back to defaults when no member has a budget/travel preference set", () => {
    const members = [makeMember({ budgetAud: null, travelKm: null })]
    const result = buildGroupProfileFromMembers(members, { fallbackCenter: { lat: 0, lng: 0 }, groupSize: 1 })
    expect(result.budgetAud).toBe(20)
    expect(result.travelKm).toBe(10)
  })

  it("averages member coordinates for the center when locations are present", () => {
    const members = [
      makeMember({ areaLat: -33.0, areaLng: 151.0 }),
      makeMember({ areaLat: -34.0, areaLng: 152.0 }),
    ]
    const result = buildGroupProfileFromMembers(members, { fallbackCenter: { lat: 0, lng: 0 }, groupSize: 2 })
    expect(result.center).toEqual({ lat: -33.5, lng: 151.5 })
  })

  it("uses the fallback center when no member has a location", () => {
    const members = [makeMember({ areaLat: null, areaLng: null })]
    const result = buildGroupProfileFromMembers(members, { fallbackCenter: { lat: -33.8886, lng: 151.1873 }, groupSize: 1 })
    expect(result.center).toEqual({ lat: -33.8886, lng: 151.1873 })
  })

  it("collects distinct non-null accessibility needs, omitting the field when there are none", () => {
    const members = [makeMember({ accessibility: "wheelchair access" }), makeMember({ accessibility: null })]
    const result = buildGroupProfileFromMembers(members, { fallbackCenter: { lat: 0, lng: 0 }, groupSize: 2 })
    expect(result.accessibilityNeeds).toEqual(["wheelchair access"])

    const noNeeds = buildGroupProfileFromMembers([makeMember({ accessibility: null })], {
      fallbackCenter: { lat: 0, lng: 0 },
      groupSize: 1,
    })
    expect(noNeeds.accessibilityNeeds).toBeUndefined()
  })

  it("uses groupSize from options, not members.length, and passes through allowedCategories", () => {
    const result = buildGroupProfileFromMembers([makeMember()], {
      fallbackCenter: { lat: 0, lng: 0 },
      groupSize: 4,
      allowedCategories: ["study"],
    })
    expect(result.groupSize).toBe(4)
    expect(result.allowedCategories).toEqual(["study"])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/venue-agent/__tests__/groupProfile.test.ts`
Expected: FAIL: `Cannot find module '@/lib/venue-agent/groupProfile'`

- [ ] **Step 3: Write the implementation**

```typescript
// lib/venue-agent/groupProfile.ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/venue-agent/__tests__/groupProfile.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Refactor `app/api/venue-agent/route.ts`'s `buildGroupProfileForMeetup` to use it**

Replace the whole body of `buildGroupProfileForMeetup` from the point `prefRows` is computed onward. Keep the existing DB loads (`meetup`, `members`, `preferences` queries) exactly as they are, and only replace this tail:

```typescript
// Replace everything from "const prefRows = ..." to the end of the function
// (the interests/accessibilityNeeds/travelValues/budgetValues/center/return
// block) with:
const prefRows = (preferences ?? []) as PreferenceRow[]

const memberInputs: MemberProfileInput[] = prefRows.map((row) => ({
  interests: row.interests ?? [],
  hobbies: row.hobbies ?? [],
  budgetAud: row.budget_aud,
  travelKm: row.travel_km,
  areaLat: row.area_lat,
  areaLng: row.area_lng,
  accessibility: row.accessibility,
}))

return buildGroupProfileFromMembers(memberInputs, {
  fallbackCenter: { lat: meetup.area_lat ?? 0, lng: meetup.area_lng ?? 0 },
  groupSize: userIds.length,
  allowedCategories: meetup.tags ?? undefined,
})
```

Add the import at the top of `app/api/venue-agent/route.ts`:

```typescript
import { buildGroupProfileFromMembers, type MemberProfileInput } from "@/lib/venue-agent/groupProfile"
```

The `DEFAULT_BUDGET_AUD`/`DEFAULT_TRAVEL_KM` constants in this file become unused: delete them (they now live in `lib/venue-agent/groupProfile.ts`).

- [ ] **Step 6: Verify no regression**

Run: `npm test`
Expected: all existing tests pass. This route has no dedicated test file; if a dev server with real credentials is available, manually exercise the reroll flow (`app/api/meetups/[id]/reroll/route.ts` imports `buildGroupProfileForMeetup` from this file) to confirm venue recommendations still generate correctly.

- [ ] **Step 7: Lint**

Run: `npm run lint`
Expected: no new errors.

- [ ] **Step 8: Commit**

```bash
git add lib/venue-agent/groupProfile.ts lib/venue-agent/__tests__/groupProfile.test.ts app/api/venue-agent/route.ts
git commit -m "refactor: extract shared buildGroupProfileFromMembers helper"
```

---

### Task 4: Add `targetSize` to `buildMatch`

**Files:**
- Modify: `lib/matcher/match.ts`
- Test: `lib/matcher/__tests__/match.test.ts` (existing file; add new `describe` block)

**Interfaces:**
- Produces: `export const GROUP_MIN = 3`, `export const GROUP_TARGET = 4`, `export const GROUP_MAX = 6` (previously unexported local consts). `buildMatch`'s third parameter gains an optional `targetSize?: number` field.
- Existing callers (`app/api/match/route.ts`, which doesn't pass `targetSize`) are unaffected; default behavior is identical to today.

- [ ] **Step 1: Write the failing test**

Add this `describe` block to the end of the existing `lib/matcher/__tests__/match.test.ts` (it already has `makeActiveUser`/`makePoolMember`/`makeCtx` helpers; reuse them, don't redefine):

```typescript
describe("buildMatch targetSize", () => {
  function makeFullPool(): PoolMember[] {
    return [
      makePoolMember("cand-1"),
      makePoolMember("cand-2"),
      makePoolMember("cand-3"),
      makePoolMember("cand-4"),
      makePoolMember("cand-5"),
      makePoolMember("cand-6"),
    ]
  }

  it("honors a targetSize within [GROUP_MIN, GROUP_MAX]", () => {
    const result = buildMatch(makeActiveUser(), makeFullPool(), makeCtx({ targetSize: 5 }))
    expect(result.status).toBe("ready")
    expect(result.members.length).toBe(5)
  })

  it("clamps a targetSize below GROUP_MIN up to GROUP_MIN", () => {
    const result = buildMatch(makeActiveUser(), makeFullPool(), makeCtx({ targetSize: 1 }))
    expect(result.status).toBe("ready")
    expect(result.members.length).toBe(3)
  })

  it("clamps a targetSize above GROUP_MAX down to GROUP_MAX", () => {
    const result = buildMatch(makeActiveUser(), makeFullPool(), makeCtx({ targetSize: 10 }))
    expect(result.status).toBe("ready")
    expect(result.members.length).toBe(6)
  })

  it("still caps to the pool size when targetSize exceeds available eligible candidates", () => {
    const smallPool = [makePoolMember("cand-1"), makePoolMember("cand-2"), makePoolMember("cand-3")]
    const result = buildMatch(makeActiveUser(), smallPool, makeCtx({ targetSize: 6 }))
    expect(result.status).toBe("ready")
    expect(result.members.length).toBe(3)
  })

  it("defaults to GROUP_TARGET (4) when targetSize is not provided", () => {
    const result = buildMatch(makeActiveUser(), makeFullPool(), makeCtx())
    expect(result.status).toBe("ready")
    expect(result.members.length).toBe(4)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/matcher/__tests__/match.test.ts`
Expected: FAIL on the new `targetSize` tests: a TypeScript error, `targetSize` does not exist on the ctx type (or, if it type-checks loosely, the honor/clamp tests fail because `buildMatch` ignores the field and always returns 4).

- [ ] **Step 3: Write the implementation**

In `lib/matcher/match.ts`, near the top of the file there are three existing unexported lines:

```typescript
const GROUP_MIN = 3
const GROUP_TARGET = 4
const GROUP_MAX = 6
```

Add the `export` keyword to each of these three existing lines in place (do not add new, separate declarations):

```typescript
export const GROUP_MIN = 3
export const GROUP_TARGET = 4
export const GROUP_MAX = 6
```

Update `buildMatch`'s signature to accept `targetSize` in its `ctx` parameter:

```typescript
export function buildMatch(
  activeUser: ActiveUser,
  pool: PoolMember[],
  ctx: { blockedPairs: Array<[string, string]>; now: Date; relaxAvailability?: boolean; targetSize?: number }
): MatchResult {
```

Replace the line that currently reads:

```typescript
  const groupSize = Math.min(scored.length, GROUP_TARGET, GROUP_MAX)
```

with:

```typescript
  const requestedTarget =
    ctx.targetSize != null ? Math.min(Math.max(ctx.targetSize, GROUP_MIN), GROUP_MAX) : GROUP_TARGET
  const groupSize = Math.min(scored.length, requestedTarget, GROUP_MAX)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/matcher/__tests__/match.test.ts`
Expected: PASS (all existing tests plus the 5 new ones)

- [ ] **Step 5: Lint**

Run: `npm run lint`
Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
git add lib/matcher/match.ts lib/matcher/__tests__/match.test.ts
git commit -m "feat: let buildMatch accept a clamped targetSize"
```

---

### Task 5: `lib/concierge/schema.ts`

**Files:**
- Create: `lib/concierge/schema.ts`
- Test: `lib/concierge/__tests__/schema.test.ts`

**Interfaces:**
- Produces: `ConciergeIntentSchema`, `type ConciergeIntent`, `ConciergeSynthesisSchema`, `type ConciergeSynthesis` (all Zod).

- [ ] **Step 1: Write the failing test**

```typescript
// lib/concierge/__tests__/schema.test.ts
import { describe, expect, it } from "vitest"
import { ConciergeIntentSchema, ConciergeSynthesisSchema } from "@/lib/concierge/schema"

function makeIntent(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    moodSummary: "low-energy, wants something calm",
    maxDurationMin: 90,
    groupSizeHint: 2,
    proposedActivity: "study",
    socialEnergy: "low",
    ...overrides,
  }
}

describe("ConciergeIntentSchema", () => {
  it("parses a valid intent", () => {
    expect(() => ConciergeIntentSchema.parse(makeIntent())).not.toThrow()
  })

  it("allows groupSizeHint, proposedActivity, and socialEnergy to be null", () => {
    const result = ConciergeIntentSchema.safeParse(
      makeIntent({ groupSizeHint: null, proposedActivity: null, socialEnergy: null })
    )
    expect(result.success).toBe(true)
  })

  it("rejects a groupSizeHint above 5", () => {
    const result = ConciergeIntentSchema.safeParse(makeIntent({ groupSizeHint: 6 }))
    expect(result.success).toBe(false)
  })

  it("rejects a non-positive maxDurationMin", () => {
    const result = ConciergeIntentSchema.safeParse(makeIntent({ maxDurationMin: 0 }))
    expect(result.success).toBe(false)
  })

  it("rejects an invalid socialEnergy value", () => {
    const result = ConciergeIntentSchema.safeParse(makeIntent({ socialEnergy: "extreme" }))
    expect(result.success).toBe(false)
  })
})

describe("ConciergeSynthesisSchema", () => {
  it("parses a valid explanation+opener pair", () => {
    const result = ConciergeSynthesisSchema.safeParse({
      explanation: "Two people nearby match on quiet study sessions.",
      opener: "Hey! Ready for a focused session?",
    })
    expect(result.success).toBe(true)
  })

  it("rejects a missing opener", () => {
    const result = ConciergeSynthesisSchema.safeParse({ explanation: "Some text." })
    expect(result.success).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/concierge/__tests__/schema.test.ts`
Expected: FAIL: `Cannot find module '@/lib/concierge/schema'`

- [ ] **Step 3: Write the implementation**

```typescript
// lib/concierge/schema.ts
import { z } from "zod"

// What Gemini extracts from the user's free-text concierge prompt.
//
// No start-time field: the concierge always means "I'm free right now"
// (same semantics as the page's existing "im_free" mode). A user who wants
// to schedule ahead already has the existing "Plan ahead" sheet for that.
export const ConciergeIntentSchema = z.object({
  moodSummary: z.string(),
  maxDurationMin: z.number().int().positive(),
  // "Other people", not counting the caller. null means no preference.
  groupSizeHint: z.number().int().min(1).max(5).nullable(),
  proposedActivity: z.string().nullable(),
  socialEnergy: z.enum(["low", "medium", "high"]).nullable(),
})

export type ConciergeIntent = z.infer<typeof ConciergeIntentSchema>

// What the synthesis step produces once a deterministic match + venue pick
// already exist. Grounded only in facts already computed — see
// lib/concierge/synthesize.ts's prompt for the "never invent" instruction.
export const ConciergeSynthesisSchema = z.object({
  explanation: z.string(),
  opener: z.string(),
})

export type ConciergeSynthesis = z.infer<typeof ConciergeSynthesisSchema>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/concierge/__tests__/schema.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Lint**

Run: `npm run lint`
Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
git add lib/concierge/schema.ts lib/concierge/__tests__/schema.test.ts
git commit -m "feat: add concierge intent/synthesis Zod schemas"
```

---

### Task 6: `lib/concierge/intent.ts`

**Depends on:** Task 1 (`lib/ai/generateJson.ts`), Task 5 (`lib/concierge/schema.ts`)

**Files:**
- Create: `lib/concierge/intent.ts`
- Test: `lib/concierge/__tests__/intent.test.ts`

**Interfaces:**
- Consumes: `generateJson(prompt, schema)` from `@/lib/ai/generateJson` (signature: `(prompt: string, schema: z.ZodType) => Promise<unknown>`); `ConciergeIntentSchema` from `@/lib/concierge/schema`.
- Produces:
  ```typescript
  export class ConciergeIntentError extends Error {}
  export interface IntentDeps {
    generate: (prompt: string, schema: import("zod").ZodType) => Promise<unknown>
  }
  export async function interpretIntent(
    text: string,
    deps?: IntentDeps
  ): Promise<ConciergeIntent>
  ```
  Retries once on failure (mirrors `runVenueAgent`'s retry loop), then throws `ConciergeIntentError`. `deps` is injectable for tests, defaulting to a real `generateJson`-backed implementation, exactly like `AgentDeps` in `lib/venue-agent/agent.ts`.

- [ ] **Step 1: Write the failing test**

```typescript
// lib/concierge/__tests__/intent.test.ts
import { describe, expect, it, vi } from "vitest"
import { interpretIntent, ConciergeIntentError, type IntentDeps } from "@/lib/concierge/intent"

function makeDeps(overrides: Partial<IntentDeps> = {}): IntentDeps {
  return {
    generate: vi.fn().mockResolvedValue({
      moodSummary: "tired, wants something low-key",
      maxDurationMin: 90,
      groupSizeHint: 2,
      proposedActivity: "study",
      socialEnergy: "low",
    }),
    ...overrides,
  }
}

describe("interpretIntent", () => {
  it("returns a validated intent from the generate dependency", async () => {
    const deps = makeDeps()
    const intent = await interpretIntent("I'm tired, have 90 minutes, want to meet two people", deps)
    expect(intent.maxDurationMin).toBe(90)
    expect(intent.groupSizeHint).toBe(2)
    expect(deps.generate).toHaveBeenCalledTimes(1)
  })

  it("retries once on failure before succeeding", async () => {
    const generate = vi
      .fn()
      .mockRejectedValueOnce(new Error("transient"))
      .mockResolvedValueOnce({
        moodSummary: "calm",
        maxDurationMin: 60,
        groupSizeHint: null,
        proposedActivity: null,
        socialEnergy: null,
      })
    const intent = await interpretIntent("something", { generate })
    expect(intent.maxDurationMin).toBe(60)
    expect(generate).toHaveBeenCalledTimes(2)
  })

  it("throws ConciergeIntentError after two consecutive failures", async () => {
    const generate = vi.fn().mockRejectedValue(new Error("down"))
    await expect(interpretIntent("something", { generate })).rejects.toBeInstanceOf(ConciergeIntentError)
    expect(generate).toHaveBeenCalledTimes(2)
  })

  it("throws ConciergeIntentError when the generated output fails schema validation", async () => {
    const generate = vi.fn().mockResolvedValue({ moodSummary: "ok" }) // missing required fields
    await expect(interpretIntent("something", { generate })).rejects.toBeInstanceOf(ConciergeIntentError)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/concierge/__tests__/intent.test.ts`
Expected: FAIL: `Cannot find module '@/lib/concierge/intent'`

- [ ] **Step 3: Write the implementation**

```typescript
// lib/concierge/intent.ts
import type { z } from "zod"
import { generateJson } from "@/lib/ai/generateJson"
import { ConciergeIntentSchema, type ConciergeIntent } from "@/lib/concierge/schema"

export class ConciergeIntentError extends Error {}

export interface IntentDeps {
  generate: (prompt: string, schema: z.ZodType) => Promise<unknown>
}

function buildIntentPrompt(text: string): string {
  return [
    "A student typed this into a spontaneous-meetup app's free-text concierge box.",
    "Extract structured intent. Return ONLY JSON matching the given schema.",
    `Message: ${JSON.stringify(text)}`,
    "maxDurationMin: how long they want to spend, in minutes. If not stated, use 90.",
    "groupSizeHint: how many OTHER people they want to meet, not counting themselves, 1-5. null if not stated.",
    'proposedActivity: a short activity keyword (e.g. "study", "coffee", "badminton") if implied, else null.',
    'socialEnergy: "low", "medium", or "high" based on their stated mood/energy, else null.',
    "moodSummary: a short (under 12 words) paraphrase of their mood and constraints.",
  ].join("\n")
}

function buildDefaultDeps(): IntentDeps {
  return { generate: generateJson }
}

export async function interpretIntent(text: string, deps: IntentDeps = buildDefaultDeps()): Promise<ConciergeIntent> {
  const prompt = buildIntentPrompt(text)

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const raw = await deps.generate(prompt, ConciergeIntentSchema)
      return ConciergeIntentSchema.parse(raw)
    } catch {
      // First failure: retry once. Second failure (or a validation failure
      // on the second attempt): fall through to the throw below.
    }
  }

  throw new ConciergeIntentError("Couldn't understand that — try rephrasing.")
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/concierge/__tests__/intent.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Lint**

Run: `npm run lint`
Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
git add lib/concierge/intent.ts lib/concierge/__tests__/intent.test.ts
git commit -m "feat: add concierge intent interpretation with retry-then-error"
```

---

### Task 7: `lib/concierge/synthesize.ts`

**Depends on:** Task 1 (`lib/ai/generateJson.ts`), Task 5 (`lib/concierge/schema.ts`)

**Files:**
- Create: `lib/concierge/synthesize.ts`
- Test: `lib/concierge/__tests__/synthesize.test.ts`

**Interfaces:**
- Consumes: `generateJson` from `@/lib/ai/generateJson`; `ConciergeSynthesisSchema` from `@/lib/concierge/schema`.
- Produces:
  ```typescript
  export interface SynthesisFacts {
    groupSize: number
    sharedInterestReasons: string[]
    venueName: string
    distanceKm: number
    maxDurationMin: number
    activityTitle: string
  }
  export interface SynthesisDeps {
    generate: (prompt: string, schema: import("zod").ZodType) => Promise<unknown>
  }
  export async function synthesizeExplanation(
    facts: SynthesisFacts,
    deps?: SynthesisDeps
  ): Promise<ConciergeSynthesis>
  ```
  Never throws: falls back to a deterministic template built from `facts` on any failure (schema-validation or Gemini-call failure alike), so this step can never block the preview.

- [ ] **Step 1: Write the failing test**

```typescript
// lib/concierge/__tests__/synthesize.test.ts
import { describe, expect, it, vi } from "vitest"
import { synthesizeExplanation, type SynthesisDeps, type SynthesisFacts } from "@/lib/concierge/synthesize"

function makeFacts(overrides: Partial<SynthesisFacts> = {}): SynthesisFacts {
  return {
    groupSize: 3,
    sharedInterestReasons: ["You share several interests and hobbies"],
    venueName: "Fisher Library",
    distanceKm: 1.2,
    maxDurationMin: 90,
    activityTitle: "Quiet study sprint",
    ...overrides,
  }
}

describe("synthesizeExplanation", () => {
  it("returns the validated Gemini output when the call succeeds", async () => {
    const deps: SynthesisDeps = {
      generate: vi.fn().mockResolvedValue({
        explanation: "Two people nearby match on quiet study sessions.",
        opener: "Hey! Ready for a focused session?",
      }),
    }
    const result = await synthesizeExplanation(makeFacts(), deps)
    expect(result.explanation).toContain("Two people nearby")
    expect(result.opener).toContain("Hey!")
  })

  it("falls back to a template when the Gemini call throws", async () => {
    const deps: SynthesisDeps = { generate: vi.fn().mockRejectedValue(new Error("down")) }
    const result = await synthesizeExplanation(makeFacts(), deps)
    expect(result.explanation).toContain("Fisher Library")
    expect(result.explanation).toContain("90")
    expect(result.opener.length).toBeGreaterThan(0)
  })

  it("falls back to a template when the Gemini output fails schema validation", async () => {
    const deps: SynthesisDeps = { generate: vi.fn().mockResolvedValue({ explanation: "only half the shape" }) }
    const result = await synthesizeExplanation(makeFacts(), deps)
    expect(result.opener.length).toBeGreaterThan(0)
  })

  it("template fallback never names individual people, only a count", () => {
    return synthesizeExplanation(makeFacts({ groupSize: 3 }), {
      generate: vi.fn().mockRejectedValue(new Error("down")),
    }).then((result) => {
      expect(result.explanation).toContain("2")
      expect(result.explanation).not.toMatch(/[A-Z][a-z]+ and [A-Z][a-z]+/)
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/concierge/__tests__/synthesize.test.ts`
Expected: FAIL: `Cannot find module '@/lib/concierge/synthesize'`

- [ ] **Step 3: Write the implementation**

```typescript
// lib/concierge/synthesize.ts
import type { z } from "zod"
import { generateJson } from "@/lib/ai/generateJson"
import { ConciergeSynthesisSchema, type ConciergeSynthesis } from "@/lib/concierge/schema"

export interface SynthesisFacts {
  groupSize: number
  sharedInterestReasons: string[]
  venueName: string
  distanceKm: number
  maxDurationMin: number
  activityTitle: string
}

export interface SynthesisDeps {
  generate: (prompt: string, schema: z.ZodType) => Promise<unknown>
}

function buildSynthesisPrompt(facts: SynthesisFacts): string {
  return [
    "Write a short explanation and an opening group-chat message for a student meetup recommendation.",
    "Use ONLY the facts below. Do not invent names, places, or details not listed here.",
    `Facts: ${JSON.stringify(facts)}`,
    "explanation: 1-2 sentences, plain and warm, referencing the shared-interest reasons, group size, venue, and duration.",
    'Never name individual people — refer to them only by count (e.g. "two people nearby").',
    "opener: a short, friendly first message for the group chat that fits the activity.",
    "Return ONLY JSON matching the given schema.",
  ].join("\n")
}

function templateFallback(facts: SynthesisFacts): ConciergeSynthesis {
  const others = Math.max(facts.groupSize - 1, 0)
  const reason = facts.sharedInterestReasons[0]?.toLowerCase() ?? "similar plans"
  return {
    explanation: `${others} ${others === 1 ? "person" : "people"} nearby who match on ${reason} — ${facts.activityTitle} at ${facts.venueName}, about ${facts.distanceKm.toFixed(1)} km away, within your ${facts.maxDurationMin}-minute window.`,
    opener: `Hey! Keen to make the most of the next ${facts.maxDurationMin} minutes — see you at ${facts.venueName}?`,
  }
}

function buildDefaultDeps(): SynthesisDeps {
  return { generate: generateJson }
}

export async function synthesizeExplanation(
  facts: SynthesisFacts,
  deps: SynthesisDeps = buildDefaultDeps()
): Promise<ConciergeSynthesis> {
  try {
    const raw = await deps.generate(buildSynthesisPrompt(facts), ConciergeSynthesisSchema)
    return ConciergeSynthesisSchema.parse(raw)
  } catch {
    return templateFallback(facts)
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/concierge/__tests__/synthesize.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Lint**

Run: `npm run lint`
Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
git add lib/concierge/synthesize.ts lib/concierge/__tests__/synthesize.test.ts
git commit -m "feat: add concierge explanation/opener synthesis with template fallback"
```

---

### Task 8: `POST /api/concierge` route

**Depends on:** Task 2 (`lib/matcher/anonymize.ts`), Task 3 (`lib/venue-agent/groupProfile.ts`), Task 4 (`buildMatch` targetSize), Task 6 (`interpretIntent`), Task 7 (`synthesizeExplanation`)

**Files:**
- Create: `app/api/concierge/route.ts`

**Interfaces:**
- Consumes: `getCurrentUser` (`@/lib/current-user`), `getAdminSupabase` (`@/lib/supabase/server`), `loadMatchInputs` (`@/lib/matcher/loadPool`), `buildMatch`, `describeGenderMix`, `GROUP_MIN`, `GROUP_MAX` (`@/lib/matcher/match`), `interpretIntent`, `ConciergeIntentError` (`@/lib/concierge/intent`), `synthesizeExplanation` (`@/lib/concierge/synthesize`), `buildGroupProfileFromMembers` (`@/lib/venue-agent/groupProfile`), `runVenueAgent` (`@/lib/venue-agent/agent`). (`sharedInterestsOf` from Task 2 is not needed here: this route surfaces `result.explanation`, buildMatch's aggregate reason list, not a per-member breakdown.)
- Produces the response shapes consumed by Task 9's UI:
  ```typescript
  interface ConciergePreviewResponse {
    status: "preview"
    intentSummary: string
    groupSize: number
    genderMix: string
    sharedInterestReasons: string[]
    venue: { name: string; reason: string; distanceKm: number; mapsUrl: string | null }
    explanation: string
    opener: string
    controls: { maxDurationMin: number; socialEnergy: "low" | "medium" | "high" | null; proposedActivity: string | null }
  }
  interface ConciergeInsufficientResponse { status: "insufficient" }
  // On error: Response.json({ error: string }, { status: 422 | 401 | 400 | 500 })
  ```

No automated test for this task. This codebase has no `app/api/*/route.test.ts` files (verified: `find app/api -name "*.test.ts"` returns nothing). Verify manually per Step 5 below, matching the project's existing convention.

- [ ] **Step 1: Write the route**

```typescript
// app/api/concierge/route.ts
// POST /api/concierge: interprets a free-text concierge prompt, runs the
// real deterministic matcher + venue agent to build a preview, and explains
// it — without persisting anything. "Lock it in" on the client calls the
// existing, unmodified POST /api/match to actually commit.
import { z } from "zod"
import { getAdminSupabase } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/current-user"
import { buildMatch, describeGenderMix, GROUP_MIN, GROUP_MAX } from "@/lib/matcher/match"
import { loadMatchInputs, type MatchPoolMember } from "@/lib/matcher/loadPool"
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
  controls: { maxDurationMin: number; socialEnergy: "low" | "medium" | "high" | null; proposedActivity: string | null }
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
    },
  }
  return Response.json(response)
}
```

- [ ] **Step 2: Manual verification: happy path**

Run: `npm run dev` (from the worktree root)
Then, with a demo session (no auth needed since `getCurrentUser()` falls back to the seeded demo user):

```bash
curl -s -X POST http://localhost:3000/api/concierge \
  -H "Content-Type: application/json" \
  -d '{"text":"Im tired, have 90 minutes, dont want anything intense, and want to meet two people near campus"}' | python3 -m json.tool
```

Expected: HTTP 200, `status: "preview"`, `controls.maxDurationMin: 90`, `groupSize` between 3 and 6, a `venue` object with a non-empty `name`, and non-empty `explanation`/`opener` strings that don't contain any first name.

- [ ] **Step 3: Manual verification: insufficient path**

Temporarily request an activity guaranteed to have no eligible pool (e.g. one of the excluded-activity patterns from `lib/matcher/loadPool.ts`, like `"pub crawl"`, forces `activityAllowed: false` for every candidate):

```bash
curl -s -X POST http://localhost:3000/api/concierge \
  -H "Content-Type: application/json" \
  -d '{"text":"want to do a pub crawl with 5 people"}' | python3 -m json.tool
```

Expected: HTTP 200, `{"status":"insufficient"}` (no `venue`/`explanation` fields).

- [ ] **Step 4: Manual verification: malformed request**

```bash
curl -s -X POST http://localhost:3000/api/concierge -H "Content-Type: application/json" -d '{}' -o /dev/null -w "%{http_code}\n"
```

Expected: `400`

- [ ] **Step 5: Lint**

Run: `npm run lint`
Expected: no new errors (fix the unused-import note above if it fires).

- [ ] **Step 6: Run the full test suite to confirm no regression**

Run: `npm test`
Expected: all tests pass (this task added no new `lib/` code, only a route, so the count should match Task 7's total).

- [ ] **Step 7: Commit**

```bash
git add app/api/concierge/route.ts
git commit -m "feat: add POST /api/concierge preview route"
```

---

### Task 9: Wire `ConciergeBox` to the real pipeline + preview card

**Depends on:** Task 8 (`POST /api/concierge`)

**Files:**
- Modify: `app/(app)/home/page.tsx`

**Interfaces:**
- Consumes: the `ConciergePreviewResponse` / `ConciergeInsufficientResponse` shapes from Task 8 (mirrored locally as a client-side interface, matching this file's existing convention of mirroring `/api/nearby`'s and `/api/match`'s response shapes locally rather than importing server route types; see the existing `NearbyEvent`/`NearbyResponse`/`MatchSuggestion` interfaces already in this file).
- Produces: a working end-to-end flow. Type in `ConciergeBox`, see a loading state, see the preview card, tap "Lock it in" to call the existing `/api/match` via `startMatch`, or "Never mind" to dismiss.

No automated test for this task. This file has no existing test coverage (it's a client page component; the project's test suite covers `lib/` only). Verify manually per the steps below.

- [ ] **Step 1: Add the new lucide icons and local response types**

In the `lucide-react` import block near the top of the file, add `X` and `MessageCircle`:

```typescript
import {
  ArrowUp,
  CalendarClock,
  Clock,
  Coffee,
  Compass,
  Feather,
  GraduationCap,
  Loader2,
  MapPin,
  MessageCircle,
  SlidersHorizontal,
  Sparkles,
  User,
  UtensilsCrossed,
  Wallet,
  X,
  Zap,
} from "lucide-react";
```

Immediately after the existing `NearbyResponse` interface (which already mirrors `/api/nearby`'s shape locally), add:

```typescript
// Mirrors POST /api/concierge's response shapes (app/api/concierge/route.ts's
// ConciergePreviewResponse / ConciergeInsufficientResponse). Kept local to
// avoid importing server code, matching this file's existing convention.
interface ConciergePreview {
  status: "preview";
  intentSummary: string;
  groupSize: number;
  genderMix: string;
  sharedInterestReasons: string[];
  venue: { name: string; reason: string; distanceKm: number; mapsUrl: string | null };
  explanation: string;
  opener: string;
  controls: { maxDurationMin: number; socialEnergy: SocialEnergy | null; proposedActivity: string | null };
}

interface ConciergeInsufficient {
  status: "insufficient";
}

type ConciergeResult =
  | ConciergePreview
  | ConciergeInsufficient
  | { status: "error"; message: string };
```

- [ ] **Step 2: Lift concierge result state into `HomePage` and update `startMatch` to accept a proposed-activity override**

Inside the `HomePage` component, find the existing state declarations block (`const [controls, setControls] = React.useState<Controls>(defaultControls);` and its neighbors) and add:

```typescript
  const [conciergeResult, setConciergeResult] = React.useState<ConciergeResult | null>(null);
```

Update `startMatch`'s signature and its `proposedActivity` line:

```typescript
  async function startMatch(mode: Mode, c: Controls, proposedActivityOverride?: string | null) {
```

Replace:

```typescript
          proposedActivity:
            ALL_ACTIVITIES.find((a) => a.id === activityId)?.proposed ?? null,
```

with:

```typescript
          proposedActivity:
            proposedActivityOverride !== undefined
              ? proposedActivityOverride
              : (ALL_ACTIVITIES.find((a) => a.id === activityId)?.proposed ?? null),
```

(Every existing call site, the main CTA's `startMatch("im_free", controls)` and the sheet's `startMatch(mode)`, omits the third argument, so `proposedActivityOverride` is `undefined` there and behavior is unchanged.)

- [ ] **Step 3: Replace the `<ConciergeBox />` render site with the wired version + preview card**

Find:

```tsx
          <motion.div variants={riseItem} className="mt-6">
            <ConciergeBox />
          </motion.div>
```

Replace with:

```tsx
          <motion.div variants={riseItem} className="mt-6">
            <ConciergeBox onResult={setConciergeResult} />
          </motion.div>
```

Immediately after the closing `</motion.div>` of the `main` element's content (i.e., right before `<ControlsSheet` in the component's return, mirroring where `<MatchOverlay` is placed as a sibling overlay), add:

```tsx
      <ConciergePreviewCard
        result={conciergeResult}
        onDismiss={() => setConciergeResult(null)}
        onLockIn={(preview) => {
          setConciergeResult(null);
          startMatch(
            "im_free",
            {
              ...controls,
              maxDurationMin: preview.controls.maxDurationMin,
              socialEnergy: preview.controls.socialEnergy ?? controls.socialEnergy,
            },
            preview.controls.proposedActivity,
          );
        }}
      />
```

- [ ] **Step 4: Rewrite `ConciergeBox` to call the real route**

Replace the entire existing `ConciergeBox` function body with:

```tsx
function ConciergeBox({ onResult }: { onResult: (result: ConciergeResult) => void }) {
  const reduce = useReducedMotion();
  const [value, setValue] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = value.trim();
    if (!text || loading) return;

    setLoading(true);
    try {
      const res = await fetch("/api/concierge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        onResult({
          status: "error",
          message: typeof data?.error === "string" ? data.error : "Couldn't reach the concierge.",
        });
        return;
      }
      onResult(data as ConciergeResult);
    } catch {
      onResult({ status: "error", message: "Couldn't reach the concierge." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative mx-auto max-w-md">
      <GlassPanel
        withTextBacking
        backingClassName="bg-surface/50 dark:bg-surface/40"
        className="rounded-full p-1.5"
      >
        <form onSubmit={handleSubmit} className="flex items-center gap-1">
          <Sparkles
            className="ml-3 h-4 w-4 shrink-0 text-[var(--accent)]"
            aria-hidden
          />
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="I want to study with baddies near me... "
            aria-label="Tell the concierge what you're in the mood for"
            disabled={loading}
            className="min-w-0 flex-1 bg-transparent px-2 py-3 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none disabled:opacity-60"
          />
          <motion.button
            type="submit"
            aria-label="Ask the concierge"
            whileTap={reduce ? undefined : { scale: 0.92 }}
            transition={spring.snappy}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[var(--accent)] text-[var(--accent-foreground)] disabled:opacity-40"
            disabled={!value.trim() || loading}
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ArrowUp className="h-4 w-4" />
            )}
          </motion.button>
        </form>
      </GlassPanel>
    </div>
  );
}
```

(This drops the old `pinged`/"still warming up" placeholder state entirely; it's superseded by the real `loading` state and the result card.)

- [ ] **Step 5: Add the `ConciergePreviewCard` component**

Add this new component right after `ConciergeBox` (before the `/* Selectable activity chips */` comment block):

```tsx
/* ------------------------------------------------------------------ */
/* Concierge result: a preview built from the real deterministic         */
/* matcher + venue agent, but nothing is persisted until "Lock it in".   */
/* ------------------------------------------------------------------ */

function ConciergePreviewCard({
  result,
  onDismiss,
  onLockIn,
}: {
  result: ConciergeResult | null;
  onDismiss: () => void;
  onLockIn: (preview: ConciergePreview) => void;
}) {
  return (
    <AnimatePresence>
      {result && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={spring.snappy}
          className="fixed inset-0 z-50 grid place-items-center bg-black/30 px-6 backdrop-blur-[2px]"
        >
          <GlassPanel
            withTextBacking
            className="w-full max-w-sm rounded-3xl p-6 text-left"
          >
            <button
              type="button"
              onClick={onDismiss}
              aria-label="Dismiss"
              className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-full text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>

            {result.status === "preview" && (
              <>
                <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--accent)]">
                  <Sparkles className="h-3.5 w-3.5" />
                  Concierge preview
                </p>
                <p className="mt-3 font-display text-lg font-semibold text-foreground">
                  {result.venue.name}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {result.groupSize} people total &middot; {result.venue.distanceKm.toFixed(1)} km away
                </p>
                <p className="mt-3 text-sm text-foreground/90">{result.explanation}</p>

                <div className="mt-4 flex items-start gap-2 rounded-2xl border border-border bg-card/60 p-3 text-sm">
                  <MessageCircle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent)]" />
                  <span className="text-foreground/90">{result.opener}</span>
                </div>

                <div className="mt-5 flex gap-2">
                  <button
                    type="button"
                    onClick={onDismiss}
                    className="flex-1 rounded-full border border-border px-4 py-2.5 text-sm font-medium text-foreground/80"
                  >
                    Never mind
                  </button>
                  <button
                    type="button"
                    onClick={() => onLockIn(result)}
                    className="flex-1 rounded-full bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-[var(--accent-foreground)]"
                  >
                    Lock it in
                  </button>
                </div>
              </>
            )}

            {result.status === "insufficient" && (
              <>
                <p className="font-display text-lg font-semibold text-foreground">
                  No group ready yet
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  Not enough people match that right now. Try again in a bit, or use &ldquo;Find
                  people now&rdquo; for a wider search.
                </p>
                <button
                  type="button"
                  onClick={onDismiss}
                  className="mt-5 rounded-full bg-[var(--accent)] px-5 py-2 text-sm font-semibold text-[var(--accent-foreground)]"
                >
                  Got it
                </button>
              </>
            )}

            {result.status === "error" && (
              <>
                <p className="font-display text-lg font-semibold text-foreground">
                  Something went wrong
                </p>
                <p className="mt-2 text-sm text-muted-foreground">{result.message}</p>
                <button
                  type="button"
                  onClick={onDismiss}
                  className="mt-5 rounded-full border border-border px-5 py-2 text-sm font-medium text-foreground/80"
                >
                  Dismiss
                </button>
              </>
            )}
          </GlassPanel>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
```

Note this component's outer `GlassPanel` needs `relative` for the absolutely-positioned dismiss button to anchor correctly. `GlassPanel` already applies `relative isolate` in its own base classes (confirmed in `components/GlassPanel.tsx`), so no extra class is needed here.

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 7: Lint**

Run: `npm run lint`
Expected: no new errors.

- [ ] **Step 8: Manual browser verification**

Run: `npm run dev`, open `/home` at a mobile viewport (390×844).

1. Type "I'm tired, have 90 minutes, don't want anything intense, and want to meet two people near campus" into the concierge box and submit. Confirm: a loading spinner shows on the send button, then the preview card appears with a venue, an explanation that names no individuals, an opener, and "Lock it in" / "Never mind" buttons.
2. Tap "Never mind": confirm the card dismisses and the input is still there (not cleared, so the user can edit and resubmit).
3. Resubmit and tap "Lock it in": confirm the existing loading → ready flow runs (the same `MatchOverlay` "Finding your people…" state) and it navigates to `/match?meetupId=...`.
4. Type something that should be insufficient (e.g. "pub crawl with 5 people"): confirm the "No group ready yet" card shows.
5. Confirm the existing hero (personalized line, activity chips, "Find people now" CTA, avatar-stack presence line, "Live nearby" feed) all still render and work exactly as before. This task should not have touched any of that.

- [ ] **Step 9: Run the full test suite one more time**

Run: `npm test`
Expected: all tests pass, same count as after Task 8 (no `lib/` changes in this task).

- [ ] **Step 10: Commit**

```bash
git add "app/(app)/home/page.tsx"
git commit -m "feat: wire ConciergeBox to POST /api/concierge with a preview card"
```

---

### Task 10: Final end-to-end verification

**Depends on:** Task 9

**Files:** none (verification only)

- [ ] **Step 1: Run the full check script**

Run: `npm run check` (runs lint, then the full test suite, then a production build)
Expected: all three stages pass. If `npm run build` fails on missing env vars in a sandboxed environment, note which ones and confirm the failure is environmental, not a code defect (cross-check against `REQUIRED_ENV` in `lib/config.ts`).

- [ ] **Step 2: Re-read the spec and confirm every decision is implemented**

Walk `docs/superpowers/specs/2026-08-30-ai-concierge-design.md` section by section against the code:
- Anonymized explanation (no names): confirm in `lib/concierge/synthesize.ts`'s prompt and `templateFallback`.
- Preview, then explicit confirm: confirm `/api/concierge` writes nothing to Supabase (no `.insert(`/`.update(` calls anywhere in `app/api/concierge/route.ts`), and "Lock it in" is the only path that calls `/api/match`.
- Group size as a clamped hint: confirm `clampTargetSize` in the route and the `GROUP_MIN`/`GROUP_MAX` tests in Task 4.
- Single-shot pipeline: confirm there's no follow-up-question branch anywhere in `lib/concierge/`.
- Previewed venue is illustrative: confirm "Lock it in" never sends the previewed `placeId`/venue to `/api/match` (its body only ever contained `travelKm`/`budgetAud`/`socialEnergy`/`proposedActivity`/`availability`, unchanged).

- [ ] **Step 3: Report**

Summarize: worktree path, branch name, commits made (one per task), test count, and confirmation that the manual browser flow in Task 9 Step 8 passed. Flag anything from Step 1/2 that didn't fully check out.
