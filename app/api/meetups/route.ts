// POST /api/meetups — create a user meetup (PRD §9.14).
//
// The creator is resolved server-side via getCurrentUser() (real session →
// seeded-demo-user fallback), NEVER from the request body: a client-supplied
// id would let any caller create meetups in someone else's name.
//
// Uses getAdminSupabase() like /api/match: `meetups`' insert RLS requires
// `created_by = auth.uid()`, which the demo user (no real auth session)
// can't satisfy. Safe here because created_by is the server-resolved id, not
// client input.
import { getCurrentUser } from "@/lib/current-user";
import { getAdminSupabase } from "@/lib/supabase/server";

const MIN_SIZE = 3;
const MAX_SIZE = 6;
const MAX_TAGS = 8;
const MAX_INTENT_LEN = 280;

interface CreateMeetupBody {
  activityIntent?: unknown;
  scheduledAt?: unknown;
  areaLat?: unknown;
  areaLng?: unknown;
  costMin?: unknown;
  costMax?: unknown;
  sizeCap?: unknown;
  tags?: unknown;
}

function toFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export async function POST(request: Request): Promise<Response> {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return Response.json({ error: "Unauthenticated" }, { status: 401 });
  }

  let body: CreateMeetupBody = {};
  try {
    const text = await request.text();
    if (text) body = JSON.parse(text) as CreateMeetupBody;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const activityIntent =
    typeof body.activityIntent === "string" ? body.activityIntent.trim() : "";
  if (!activityIntent) {
    return Response.json({ error: "activityIntent is required" }, { status: 400 });
  }
  if (activityIntent.length > MAX_INTENT_LEN) {
    return Response.json(
      { error: `activityIntent must be ${MAX_INTENT_LEN} characters or fewer` },
      { status: 400 },
    );
  }

  const sizeCapRaw = toFiniteNumber(body.sizeCap);
  const sizeCap =
    sizeCapRaw == null
      ? MAX_SIZE
      : Math.min(MAX_SIZE, Math.max(MIN_SIZE, Math.round(sizeCapRaw)));

  const costMin = toFiniteNumber(body.costMin);
  const costMax = toFiniteNumber(body.costMax);
  if (costMin != null && costMin < 0) {
    return Response.json({ error: "costMin cannot be negative" }, { status: 400 });
  }
  if (costMin != null && costMax != null && costMin > costMax) {
    return Response.json({ error: "costMin cannot exceed costMax" }, { status: 400 });
  }

  let scheduledAtIso: string | null = null;
  if (typeof body.scheduledAt === "string" && body.scheduledAt.trim()) {
    const parsed = new Date(body.scheduledAt);
    if (Number.isNaN(parsed.getTime())) {
      return Response.json({ error: "scheduledAt is not a valid date" }, { status: 400 });
    }
    scheduledAtIso = parsed.toISOString();
  }

  const tags = Array.isArray(body.tags)
    ? Array.from(
        new Set(
          body.tags
            .filter((t): t is string => typeof t === "string")
            .map((t) => t.trim().toLowerCase())
            .filter(Boolean),
        ),
      ).slice(0, MAX_TAGS)
    : [];

  const supabase = getAdminSupabase();

  const { data: meetup, error: meetupError } = await supabase
    .from("meetups")
    .insert({
      status: "forming",
      created_by: currentUser.id,
      size_cap: sizeCap,
      activity_intent: activityIntent,
      tags,
      cost_min: costMin != null ? Math.round(costMin) : null,
      cost_max: costMax != null ? Math.round(costMax) : null,
      area_lat: toFiniteNumber(body.areaLat),
      area_lng: toFiniteNumber(body.areaLng),
      scheduled_at: scheduledAtIso,
    })
    .select("id")
    .single();

  if (meetupError || !meetup) {
    return Response.json(
      { error: meetupError?.message ?? "Failed to create meetup" },
      { status: 500 },
    );
  }

  // The host joins their own meetup as an accepted member (matches the
  // seeded user-created meetups in supabase/seed.sql). Non-fatal: the meetup
  // already exists, so report a warning rather than failing the request.
  const { error: memberError } = await supabase.from("meetup_members").insert({
    meetup_id: meetup.id,
    user_id: currentUser.id,
    accepted: true,
  });
  if (memberError) {
    return Response.json(
      { id: meetup.id, warning: `host auto-join failed: ${memberError.message}` },
      { status: 201 },
    );
  }

  return Response.json({ id: meetup.id }, { status: 201 });
}
