import * as React from "react";
import { ShieldCheck, Sparkles, Users } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export interface GroupPreviewProps {
  size: number;
  genderMix: string;
  ageRanges: string[];
  /** Rendered as badges using the --cat-* categorical hues. */
  sharedInterests: string[];
  /** "N/size university-verified" badge. */
  verifiedCount: number;
  compatibilityReason: string;
  className?: string;
}

// Static class strings (not built from template literals) so Tailwind's
// v4 build-time scanner can see and generate every one of these utilities.
const CAT_BADGE_CLASSES = [
  "border-cat-blue/30 bg-cat-blue/20 text-cat-foreground",
  "border-cat-sage/30 bg-cat-sage/20 text-cat-foreground",
  "border-cat-clay/30 bg-cat-clay/20 text-cat-foreground",
  "border-cat-plum/30 bg-cat-plum/20 text-cat-foreground",
  "border-cat-teal/30 bg-cat-teal/20 text-cat-foreground",
] as const;

/**
 * Anonymous pre-acceptance group preview. Shows only group-level info:
 * names, photos, contact details, exact locations, and reliability have no
 * prop here.
 */
export function GroupPreview({
  size,
  genderMix,
  ageRanges,
  sharedInterests,
  verifiedCount,
  compatibilityReason,
  className,
}: GroupPreviewProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-2xl bg-card p-4 text-card-foreground ring-1 ring-foreground/10 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_-12px_rgba(0,0,0,0.18)]",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1 text-sm font-medium">
            <Users className="size-4 text-muted-foreground" aria-hidden />
            Group of {size}
          </span>
          <span className="text-sm text-muted-foreground">· {genderMix}</span>
        </div>
        <Badge variant="outline" className="shrink-0">
          <ShieldCheck className="size-3" aria-hidden />
          {verifiedCount}/{size} verified
        </Badge>
      </div>

      <div className="flex flex-wrap gap-1.5" aria-hidden={size === 0}>
        {Array.from({ length: size }).map((_, i) => (
          <span
            key={i}
            className="size-6 rounded-full bg-muted ring-1 ring-foreground/10"
          />
        ))}
      </div>

      {ageRanges.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {ageRanges.map((range) => (
            <Badge key={range} variant="secondary">
              {range}
            </Badge>
          ))}
        </div>
      )}

      {sharedInterests.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {sharedInterests.map((interest, i) => (
            <span
              key={interest}
              className={cn(
                "inline-flex items-center rounded-4xl border px-2 py-0.5 text-xs font-medium",
                CAT_BADGE_CLASSES[i % CAT_BADGE_CLASSES.length],
              )}
            >
              {interest}
            </span>
          ))}
        </div>
      )}

      <p className="flex items-start gap-1.5 rounded-lg bg-muted/60 px-3 py-2 text-sm text-foreground/90">
        <Sparkles className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
        {compatibilityReason}
      </p>
    </div>
  );
}
