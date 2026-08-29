import Link from "next/link";
import { CalendarPlus, Plus } from "lucide-react";

import { MeetupCard, type MeetupCardData } from "@/components/MeetupCard";
import { getAdminSupabase } from "@/lib/supabase/server";

// DB-backed per user. Never statically prerender a browse feed of live rows.
export const dynamic = "force-dynamic";

const WHEN_FORMATTER = new Intl.DateTimeFormat("en-AU", {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "Australia/Sydney",
});

function formatWhen(iso: string | null): string {
  if (!iso) return "Time to be confirmed";
  return WHEN_FORMATTER.format(new Date(iso));
}

function formatCostRange(min: number | null, max: number | null): string | null {
  if (min == null && max == null) return null;
  if (min != null && max != null) return `$${min}–$${max}`;
  return `~$${min ?? max}`;
}

function formatCoarseArea(lat: number | null, lng: number | null): string {
  if (lat == null || lng == null) return "Area to be confirmed";
  return `Near ${lat.toFixed(2)}, ${lng.toFixed(2)}`;
}

/**
 * Loads the browsable user-created meetup feed.
 *
 * Uses getAdminSupabase() because the current RLS policy only grants SELECT
 * to a meetup's creator or an existing member, and there is no public-browse
 * policy yet. Server-only; not imported into any client component.
 */
async function loadUserCreatedMeetups(): Promise<MeetupCardData[]> {
  const supabase = getAdminSupabase();

  const { data: meetups } = await supabase
    .from("meetups")
    .select(
      "id, activity_intent, tags, cost_min, cost_max, area_lat, area_lng, scheduled_at, size_cap, created_by",
    )
    .eq("status", "forming")
    .not("created_by", "is", null)
    .order("scheduled_at", { ascending: true });

  if (!meetups || meetups.length === 0) {
    return [];
  }

  const meetupIds = meetups.map((m) => m.id);
  const hostIds = Array.from(
    new Set(meetups.map((m) => m.created_by).filter((id): id is string => !!id)),
  );

  const [{ data: members }, { data: hosts }, { data: recs }] = await Promise.all([
    supabase
      .from("meetup_members")
      .select("meetup_id")
      .in("meetup_id", meetupIds)
      .eq("accepted", true),
    supabase.from("profiles").select("user_id, first_name").in("user_id", hostIds),
    supabase
      .from("activity_recommendations")
      .select("meetup_id, venue_name, raw_places_json")
      .in("meetup_id", meetupIds),
  ]);

  const countByMeetup = new Map<string, number>();
  for (const row of members ?? []) {
    countByMeetup.set(row.meetup_id, (countByMeetup.get(row.meetup_id) ?? 0) + 1);
  }
  const hostNameById = new Map((hosts ?? []).map((h) => [h.user_id, h.first_name]));
  const recByMeetup = new Map((recs ?? []).map((r) => [r.meetup_id, r]));

  return meetups.map((m) => {
    const rec = recByMeetup.get(m.id);
    const rawPlaces = rec?.raw_places_json as { formattedAddress?: string } | null;
    const address = rawPlaces?.formattedAddress ?? null;

    return {
      id: m.id,
      activityIntent: m.activity_intent,
      tags: m.tags ?? [],
      costLabel: formatCostRange(m.cost_min, m.cost_max),
      whenLabel: formatWhen(m.scheduled_at),
      areaLabel: address ?? formatCoarseArea(m.area_lat, m.area_lng),
      sizeCap: m.size_cap,
      memberCount: countByMeetup.get(m.id) ?? 0,
      hostFirstName: m.created_by ? (hostNameById.get(m.created_by) ?? null) : null,
      venueName: rec?.venue_name ?? null,
    };
  });
}

export default async function MeetupsPage() {
  const meetups = await loadUserCreatedMeetups();

  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-6 bg-background p-5 pb-24 sm:p-8">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
            Meetups
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Public, student-created activities you can join.
          </p>
        </div>
        <Link
          href="/meetups/create"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-[var(--accent-foreground)] shadow-lg shadow-[var(--accent)]/25 transition-transform hover:-translate-y-0.5 active:translate-y-0"
        >
          <Plus className="size-4" aria-hidden />
          Create
        </Link>
      </header>

      {meetups.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="flex flex-col gap-4">
          {meetups.map((meetup) => (
            <MeetupCard key={meetup.id} meetup={meetup} />
          ))}
        </div>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl bg-card px-6 py-12 text-center text-card-foreground ring-1 ring-foreground/10">
      <CalendarPlus className="size-8 text-muted-foreground" aria-hidden />
      <p className="font-heading text-base font-medium text-foreground">
        No meetups yet
      </p>
      <p className="max-w-xs text-sm text-muted-foreground">
        Be the first to start one — pick an activity and Momentum will help you find a place.
      </p>
      <Link
        href="/meetups/create"
        className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-[var(--accent-foreground)] shadow-lg shadow-[var(--accent)]/25"
      >
        <Plus className="size-4" aria-hidden />
        Create a meetup
      </Link>
    </div>
  );
}
