# Momentum

**From scrolling alone to a confirmed, personalised group activity at a real venue — in under two minutes.**

Momentum is a mobile-first PWA for university students. A student says when they're free, how far they'll travel, and what they enjoy; a deterministic matcher forms a small group of compatible, verified students; an AI venue agent finds a real activity and venue nearby; the group accepts, identities are revealed in stages, and the plan is confirmed. It uses technology to get people *off* technology.

Built for **SYNCS Hack 2026** (theme: *Blocks That Make Up the World*).

**Live:** https://project-alpha-ebon-beta.vercel.app — tap **Enter demo** on the landing page to walk the full journey as a seeded student (no email required).

---

## The demo journey

Landing → **Enter demo** → 60-second onboarding → **I'm free later today** → agent-progress (matching + live Places search) → proposed venue + anonymous group → **Accept** (or reroll once) → quorum → identity reveal + group chat + **Lock me in** → demo time-skip → one-tap feedback → Momentum ring updates.

## Architecture: what decides what

The design deliberately separates three responsibilities, and the UI makes the boundary visible — this is the core of the technical pitch.

| Layer | Owns | Never does |
| --- | --- | --- |
| **Deterministic code** (TypeScript) | Eligibility, safety, quorum, compatibility scoring | Defer a safety/eligibility decision to the model |
| **Gemini** (`gemini-3.7-flash`) | Free-text → interest tags, venue search plan, ranking of *returned* candidates, short explanations | Invent venue facts; its output is validated against a strict Zod schema |
| **Google Places (New)** | The source of truth for every venue fact (name, address, hours, price, photo) | — |

The backend **rejects any recommendation whose Place ID was not returned by Google Places in that same request**, so the AI cannot fabricate a venue.

### Matching logic

Safety and eligibility are **hard gates** applied *before* any scoring (unverified/under-18, no availability overlap, mutual block, safety hold, unmet accessibility, disallowed activity). Candidates that pass are ranked by an explainable weighted score:

| Signal | Weight |
| --- | ---: |
| Shared interests & activity fit | 30% |
| Availability overlap | 20% |
| Travel practicality (haversine vs each user's range) | 15% |
| Budget fit | 10% |
| Social energy & group fit | 10% |
| Previous feedback | 10% |
| Private reliability | 5% |

Groups target 4 (minimum quorum 3, maximum 6). Early matches favour familiar interests (90/10), shifting toward exploratory (70/30) after three successful meetups. If fewer than three candidates pass the gates, the app offers the nearest compatible future pool — never a fabricated group.

### Venue-agent flow

`Gemini → structured search plan → Google Places Text Search + Place Details (field-masked) → Gemini ranks only the returned candidates → Zod validation + Place-ID membership check → one recommendation`

The recommendation carries a real Places photo, address, opening status, estimated distance/price, an interest-tied reason, and honest `over_budget` / `over_distance` flags. On a Places/Gemini failure the agent retries once, then falls back to a clearly-labelled cached demo result. It never invents opening hours, prices, or booking details.

## Seeded demo data

The prototype runs against a seeded world (data-driven and interactive, not screenshots):

- **12 student profiles** with varied interests, availability, budget, location, language, gender, age range, social energy and reliability. The active demo user has basketball, food exploration and casual outdoor interests, with ~4 explainably-overlapping candidates.
- One confirmed system-generated meetup, three user-created meetups, group-chat history, a prior completed activity (for the Momentum profile), one mutual "meet again" → friendship, and one budget/distance exception.

What's genuinely live: the matcher, the Gemini tool-calling workflow, real Google Places retrieval, accept/reroll/quorum, staged disclosure, chat send, and feedback → Momentum.

## Tech stack

Next.js (App Router, TypeScript) · Tailwind CSS + shadcn/ui · Supabase (Postgres, Auth, Storage, RLS) · Google Gemini (`gemini-3.7-flash`) · Google Places API (New) · Framer Motion · Zod · Vercel. Mobile-first PWA.

## Running locally

```bash
npm install
cp .env.example .env.local   # fill in the values below
npm run dev                  # http://localhost:3000
```

Required environment variables (`.env.example`):

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (server only)
- `GEMINI_API_KEY` (server only)
- `GOOGLE_PLACES_API_KEY` (server only)

Database: apply `supabase/migrations/*.sql` then `supabase/seed.sql` to a Supabase project.

```bash
npm run build    # production build
npx vitest run   # unit tests (matcher gates/score/orchestration, venue schema/validation, momentum)
```

All Gemini and Google keys stay server-side (route handlers / server actions); the service-role key never reaches the client bundle.

## Safety

18+ and university-verified users, system groups of at least three, first meetups in public venues only, block/report with private report history, and a trusted-contact check-in option. The matcher enforces safety as gates before any compatibility scoring; reliability and reports are never exposed to participants.

## Third-party components

Next.js, React, TypeScript, Tailwind CSS, shadcn/ui, Supabase (Auth/Postgres/Storage/RLS), Google Gemini API, Google Places API (New), Framer Motion, Zod, Vercel, Lucide icons.
