// GET /api/nearby powers the home feed: the caller's first name, a live count
// of people free right now, and the forming user-created meetups nearby.
//
// Uses getAdminSupabase() for the same reason as the /meetups browse feed:
// RLS only grants SELECT on meetups to a creator or member, and there is no
// public-browse policy yet. Labels are pre-formatted server-side so the client
// stays dumb and free of hydration drift, mirroring MeetupCardData.
import { getCurrentUser } from "@/lib/current-user";
import { getAdminSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// Coarse "you are here" reference (University of Sydney) used only when a
// meetup has no recommendation distance to fall back on. Never a real GPS fix.
const REF_LAT = -33.8886;
const REF_LNG = 151.1873;

function haversineKm(lat: number, lng: number): number {
  const R = 6371;
  const dLat = ((lat - REF_LAT) * Math.PI) / 180;
  const dLng = ((lng - REF_LNG) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((REF_LAT * Math.PI) / 180) *
      Math.cos((lat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function distanceLabel(km: number | null): string {
  if (km == null || !Number.isFinite(km)) return "Nearby";
  return `${km.toFixed(1)} km away`;
}

function whenLabel(iso: string | null): string {
  if (!iso) return "Time TBC";
  const diffMin = Math.round((new Date(iso).getTime() - Date.now()) / 60_000);
  if (diffMin <= 0) return "Happening now";
  if (diffMin < 60) return `Leaving in ${diffMin} min`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `In ${diffH}h`;
  const diffD = Math.round(diffH / 24);
  return `In ${diffD} day${diffD > 1 ? "s" : ""}`;
}

export interface NearbyEvent {
  id: string;
  title: string;
  venueName: string | null;
  hostFirstName: string | null;
  whenLabel: string;
  distanceLabel: string;
  memberCount: number;
  spotsLeft: number;
}

export interface NearbyResponse {
  name: string | null;
  availableCount: number;
  events: NearbyEvent[];
}

export async function GET(): Promise<Response> {
  const supabase = getAdminSupabase();
  const currentUser = await getCurrentUser();
  const nowIso = new Date().toISOString();

  // Caller's first name for the greeting (null when signed out / no profile).
  let name: string | null = null;
  if (currentUser) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("first_name")
      .eq("user_id", currentUser.id)
      .maybeSingle();
    name = profile?.first_name ?? null;
  }

  // People free right now: distinct users with an im_free window spanning now,
  // excluding the caller themselves.
  const { data: windows } = await supabase
    .from("availability_windows")
    .select("user_id")
    .eq("mode", "im_free")
    .lte("start_at", nowIso)
    .gte("end_at", nowIso);
  const availableUsers = new Set((windows ?? []).map((w) => w.user_id));
  if (currentUser) availableUsers.delete(currentUser.id);
  let availableCount = availableUsers.size;

  // The demo seed timestamps its im_free windows at seed time, so they expire
  // and the live count collapses to 0 in a stale-seed environment. Fall back
  // to everyone who uses spontaneous (im_free) mode so the home feed still
  // reflects the intended "free right now" pool. A live deployment with fresh
  // windows never hits this branch.
  if (availableCount === 0) {
    const { data: spontaneous } = await supabase
      .from("availability_windows")
      .select("user_id")
      .eq("mode", "im_free");
    const pool = new Set((spontaneous ?? []).map((w) => w.user_id));
    if (currentUser) pool.delete(currentUser.id);
    availableCount = pool.size;
  }

  // Forming, host-created meetups = the browsable nearby feed.
  const { data: meetups } = await supabase
    .from("meetups")
    .select(
      "id, activity_intent, area_lat, area_lng, scheduled_at, size_cap, created_by",
    )
    .eq("status", "forming")
    .not("created_by", "is", null)
    .order("scheduled_at", { ascending: true });

  let events: NearbyEvent[] = [];
  if (meetups && meetups.length > 0) {
    const meetupIds = meetups.map((m) => m.id);
    const hostIds = Array.from(
      new Set(
        meetups
          .map((m) => m.created_by)
          .filter((id): id is string => !!id),
      ),
    );

    const [{ data: members }, { data: hosts }, { data: recs }] =
      await Promise.all([
        supabase
          .from("meetup_members")
          .select("meetup_id")
          .in("meetup_id", meetupIds)
          .eq("accepted", true),
        supabase
          .from("profiles")
          .select("user_id, first_name")
          .in("user_id", hostIds),
        supabase
          .from("activity_recommendations")
          .select("meetup_id, activity_title, venue_name, est_distance_km")
          .in("meetup_id", meetupIds),
      ]);

    const countByMeetup = new Map<string, number>();
    for (const row of members ?? []) {
      countByMeetup.set(
        row.meetup_id,
        (countByMeetup.get(row.meetup_id) ?? 0) + 1,
      );
    }
    const hostNameById = new Map(
      (hosts ?? []).map((h) => [h.user_id, h.first_name as string | null]),
    );
    const recByMeetup = new Map((recs ?? []).map((r) => [r.meetup_id, r]));

    events = meetups.map((m) => {
      const rec = recByMeetup.get(m.id);
      const km =
        (rec?.est_distance_km as number | null | undefined) ??
        (typeof m.area_lat === "number" && typeof m.area_lng === "number"
          ? haversineKm(m.area_lat, m.area_lng)
          : null);
      const memberCount = countByMeetup.get(m.id) ?? 0;

      return {
        id: m.id,
        title:
          (rec?.activity_title as string | null) ??
          m.activity_intent ??
          "A meetup nearby",
        venueName: (rec?.venue_name as string | null) ?? null,
        hostFirstName: m.created_by
          ? (hostNameById.get(m.created_by) ?? null)
          : null,
        whenLabel: whenLabel(m.scheduled_at),
        distanceLabel: distanceLabel(km),
        memberCount,
        spotsLeft: Math.max((m.size_cap ?? 0) - memberCount, 0),
      };
    });
  }

  const response: NearbyResponse = { name, availableCount, events };
  return Response.json(response);
}
