"use client";

import * as React from "react";
import { CalendarClock, ChevronDown, MapPin, Users } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface MeetupCardData {
  id: string;
  /** Host intent from meetups.activity_intent; also the card title. */
  activityIntent: string | null;
  tags: string[];
  /** Pre-formatted (e.g. "$10–$20"), or null if the host set no cost range. */
  costLabel: string | null;
  /** Pre-formatted (e.g. "Sat, 6 Sep · 4:00 pm"), computed server-side to avoid hydration drift. */
  whenLabel: string;
  /** Venue address or coarse coordinate fallback. */
  areaLabel: string;
  sizeCap: number;
  memberCount: number;
  hostFirstName: string | null;
  /** From a linked activity_recommendations row, if the host already has one. */
  venueName: string | null;
}

export interface MeetupCardProps {
  meetup: MeetupCardData;
  className?: string;
}

/**
 * Tappable meetup card that expands in place. "Request to join" is local
 * state only. Full join logic is a later task.
 */
export function MeetupCard({ meetup, className }: MeetupCardProps) {
  const [expanded, setExpanded] = React.useState(false);
  const [requested, setRequested] = React.useState(false);
  const spotsLeft = Math.max(meetup.sizeCap - meetup.memberCount, 0);
  const isFull = spotsLeft === 0;

  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-2xl bg-card p-4 text-card-foreground ring-1 ring-foreground/10 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_-12px_rgba(0,0,0,0.18)]",
        className,
      )}
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="flex items-start justify-between gap-3 text-left"
      >
        <div className="flex flex-col gap-1">
          <h3 className="font-heading text-lg leading-snug font-medium text-foreground">
            {meetup.activityIntent ?? meetup.venueName ?? "Untitled meetup"}
          </h3>
          {meetup.hostFirstName && (
            <p className="text-xs text-muted-foreground">
              Hosted by {meetup.hostFirstName}
            </p>
          )}
        </div>
        <ChevronDown
          className={cn(
            "mt-1 size-4 shrink-0 text-muted-foreground transition-transform",
            expanded && "rotate-180",
          )}
          aria-hidden
        />
      </button>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-muted-foreground">
        <span className="flex items-center gap-1">
          <CalendarClock className="size-3.5" aria-hidden />
          {meetup.whenLabel}
        </span>
        <span className="flex items-center gap-1">
          <MapPin className="size-3.5" aria-hidden />
          {meetup.areaLabel}
        </span>
        <span className="flex items-center gap-1">
          <Users className="size-3.5" aria-hidden />
          {meetup.memberCount}/{meetup.sizeCap} going
        </span>
      </div>

      {(meetup.tags.length > 0 || meetup.costLabel) && (
        <div className="flex flex-wrap gap-1.5">
          {meetup.tags.map((tag) => (
            <Badge key={tag} variant="outline">
              {tag}
            </Badge>
          ))}
          {meetup.costLabel && <Badge variant="secondary">{meetup.costLabel}</Badge>}
        </div>
      )}

      {expanded && (
        <div className="flex flex-col gap-1 rounded-lg bg-muted/60 px-3 py-2 text-sm text-foreground/90">
          {meetup.venueName && <p>Suggested venue: {meetup.venueName}</p>}
          <p>Public venue · all attendees are university-verified and 18+.</p>
        </div>
      )}

      <div className="flex items-center gap-2 pt-1">
        <Button
          size="sm"
          variant={requested ? "secondary" : "default"}
          disabled={isFull && !requested}
          onClick={() => setRequested((v) => !v)}
        >
          {requested ? "Requested" : isFull ? "Full" : "Request to join"}
        </Button>
        {isFull && !requested && (
          <span className="text-xs text-muted-foreground">Group is at capacity</span>
        )}
      </div>
    </div>
  );
}
