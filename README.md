# Project Alpha

A bored student can go from a phone to a confirmed group activity at a real venue in under two minutes.

Project Alpha is a mobile-first PWA for university students. You set when you are free, how far you will travel, and what you enjoy. TypeScript matching forms a small group of compatible, verified students. A Gemini venue agent searches Google Places for a real activity nearby. The group accepts. Identities open in stages. The plan locks in. The product uses technology so you can leave it behind.

Built for **SYNCS Hack 2026** (theme: *Blocks That Make Up the World*).

**Live:** https://project-alpha-ebon-beta.vercel.app. Tap **Enter demo** on the landing page. You walk the full journey as a seeded student. No email.

## The demo journey

Landing → **Enter demo** → 60-second onboarding → **I'm free later today** → matching + live Places search → proposed venue + anonymous group → **Accept** (or reroll once) → quorum → identity reveal + group chat + **Lock me in** → **Demo: skip to feedback** → one-tap feedback → progress ring updates.

## Architecture: what decides what

Three layers. The UI shows the split. That split is the pitch.

| Layer | Owns | Does not |
| --- | --- | --- |
| **Deterministic code** (TypeScript) | Eligibility, safety, quorum, compatibility scoring | Hand a safety or eligibility call to the model |
| **Gemini** (`gemini-3.7-flash`) | Free-text → interest tags, venue search plan, ranking of *returned* candidates, short explanations | Invent venue facts. Zod validates every model payload |
| **Google Places (New)** | Venue facts: name, address, hours, price, photo | Rank people or invent a Place |

The backend rejects any recommendation whose Place ID was missing from that request's Places results. The model cannot invent a venue.

### Matching logic

Safety and eligibility are hard gates, applied before scoring: unverified or under 18, no availability overlap, mutual block, safety hold, unmet accessibility, disallowed activity. Candidates that pass get an explainable weighted score:

| Signal | Weight |
| --- | ---: |
| Shared interests and activity fit | 30% |
| Availability overlap | 20% |
| Travel practicality (haversine vs each user's range) | 15% |
| Budget fit | 10% |
| Social energy and group fit | 10% |
| Previous feedback | 10% |
| Private reliability | 5% |

Groups target 4 (quorum 3, cap 6). The first meetups weight familiar interests 90/10. After three completed meetups the mix moves to 70/30 exploratory. If fewer than three candidates pass the gates, the app offers the nearest compatible future pool. It does not invent a group.

### Venue-agent flow

`Gemini → structured search plan → Google Places Text Search + Place Details (field-masked) → Gemini ranks only the returned candidates → Zod validation + Place-ID membership check → one recommendation`

The card shows a real Places photo, address, opening status, estimated distance, an interest-tied reason, and honest over-budget / over-distance flags. Price is omitted when Places has no dollar amount. On a Places or Gemini failure the agent retries once, then falls back to a labelled cached demo result. It does not invent opening hours, prices, or booking.

## Seeded demo data

The prototype runs on a seeded world. The data is interactive, not screenshots.

- **12 student profiles** with varied interests, availability, budget, location, language, gender, age range, social energy, and reliability. The active demo user likes basketball, food exploration, and casual outdoor. About four candidates overlap in a way you can explain.
- One confirmed system-generated meetup, three user-created meetups, group-chat history, a prior completed activity (Project Alpha profile), one mutual "meet again" friendship, and one budget/distance exception.

Live in this build: matcher, Gemini tool-calling, Google Places retrieval, accept / reroll / quorum, staged disclosure, chat send, and feedback → profile ring.

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
npx vitest run   # matcher, venue schema/validation, momentum
```

Gemini and Places keys stay in route handlers and server actions. The service-role key does not ship in the client bundle.

## Safety

Users are 18+ and university-verified. System groups have at least three people. First meetups are public venues. Block and report exist; report history stays private. A trusted-contact check-in is optional. The matcher applies safety as gates before scoring. Reliability and reports stay off participant screens.

## Third-party components

Next.js, React, TypeScript, Tailwind CSS, shadcn/ui, Supabase (Auth/Postgres/Storage/RLS), Google Gemini API, Google Places API (New), Framer Motion, Zod, Vercel, Lucide icons. Developed with AI assistance (Claude Code).
