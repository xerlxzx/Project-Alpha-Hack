import * as React from "react";
import {
  ExternalLink,
  ImageOff,
  MapPin,
  Sparkles,
  TriangleAlert,
  Wallet,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface ProposalCardProps {
  activityTitle: string;
  venueName: string;
  address: string;
  /** Real Google Places photo when available. */
  photoUrl?: string | null;
  openNow?: boolean | null;
  estimatedDistanceKm?: number;
  estimatedCostAud?: number | null;
  /** Explanation tied to shared interests. */
  reason: string;
  /** Show a clear neutral warning when the pick runs over the group's budget. */
  overBudgetPreference?: boolean;
  /** Show a clear neutral warning when the pick runs beyond the group's distance preference. */
  overDistancePreference?: boolean;
  mapsUrl?: string | null;
  bookingUrl?: string | null;
  className?: string;
}

export function ProposalCard({
  activityTitle,
  venueName,
  address,
  photoUrl,
  openNow,
  estimatedDistanceKm,
  estimatedCostAud,
  reason,
  overBudgetPreference,
  overDistancePreference,
  mapsUrl,
  bookingUrl,
  className,
}: ProposalCardProps) {
  const distanceLabel =
    estimatedDistanceKm != null
      ? estimatedDistanceKm < 1
        ? `${Math.round(estimatedDistanceKm * 1000)} m away`
        : `${estimatedDistanceKm.toFixed(1)} km away`
      : null;
  const costLabel =
    estimatedCostAud != null ? `~$${estimatedCostAud} AUD` : "Cost unavailable";

  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl bg-card text-card-foreground ring-1 ring-foreground/10 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_-12px_rgba(0,0,0,0.18)]",
        className,
      )}
    >
      <div className="relative aspect-[16/9] w-full bg-muted">
        {photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photoUrl}
            alt={venueName}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 bg-gradient-to-br from-muted to-muted/60 text-muted-foreground">
            <ImageOff className="size-6" aria-hidden />
            <span className="text-xs">No photo yet</span>
          </div>
        )}
        {openNow != null && (
          <Badge
            variant="secondary"
            className="absolute top-2 left-2 bg-background/85 backdrop-blur-sm"
          >
            <span
              className={cn(
                "size-1.5 rounded-full",
                openNow ? "bg-cat-sage" : "bg-destructive",
              )}
              aria-hidden
            />
            {openNow ? "Open now" : "Closed now"}
          </Badge>
        )}
      </div>

      <div className="flex flex-col gap-3 p-4">
        <div className="flex flex-col gap-0.5">
          <h3 className="font-heading text-lg leading-snug font-medium">
            {activityTitle}
          </h3>
          <p className="text-sm text-muted-foreground">{venueName}</p>
          <p className="text-xs text-muted-foreground">{address}</p>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {distanceLabel && (
            <Badge
              variant="outline"
              className={overDistancePreference ? "border-warning/40 bg-warning/10 text-warning" : undefined}
            >
              <MapPin className="size-3" aria-hidden />
              {distanceLabel}
              {overDistancePreference && (
                <TriangleAlert className="size-3" aria-hidden />
              )}
            </Badge>
          )}
          <Badge
            variant="outline"
            className={overBudgetPreference ? "border-warning/40 bg-warning/10 text-warning" : undefined}
          >
            <Wallet className="size-3" aria-hidden />
            {costLabel}
            {overBudgetPreference && (
              <TriangleAlert className="size-3" aria-hidden />
            )}
          </Badge>
        </div>

        {(overBudgetPreference || overDistancePreference) && (
          <div className="flex flex-col gap-1">
            {overBudgetPreference && (
              <p className="flex items-center gap-1.5 text-xs font-medium text-warning">
                <TriangleAlert className="size-3.5 shrink-0" aria-hidden />
                A bit over the group&apos;s usual budget
              </p>
            )}
            {overDistancePreference && (
              <p className="flex items-center gap-1.5 text-xs font-medium text-warning">
                <TriangleAlert className="size-3.5 shrink-0" aria-hidden />
                A bit beyond the group&apos;s usual distance
              </p>
            )}
          </div>
        )}

        <p className="flex items-start gap-1.5 rounded-lg bg-muted/60 px-3 py-2 text-sm text-foreground/90">
          <Sparkles className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
          {reason}
        </p>

        {(mapsUrl || bookingUrl) && (
          <div className="flex flex-wrap gap-2 pt-1">
            {mapsUrl && (
              <Button
                variant="outline"
                size="sm"
                nativeButton={false}
                render={
                  <a href={mapsUrl} target="_blank" rel="noreferrer" />
                }
              >
                <MapPin data-icon="inline-start" aria-hidden />
                Open in Maps
                <ExternalLink data-icon="inline-end" aria-hidden />
              </Button>
            )}
            {bookingUrl && bookingUrl !== mapsUrl && (
              <Button
                size="sm"
                nativeButton={false}
                render={
                  <a href={bookingUrl} target="_blank" rel="noreferrer" />
                }
              >
                Visit venue website
                <ExternalLink data-icon="inline-end" aria-hidden />
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
