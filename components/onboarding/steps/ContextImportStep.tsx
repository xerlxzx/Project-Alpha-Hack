"use client";

import * as React from "react";
import { X, Import } from "lucide-react";

// Canned "import" candidates for the simulated preview (PRD §9.3: for the
// hackathon this is an interactive preview, not a live external
// integration). Chosen to plausibly read as hobbies/interests only — never
// relationships, conversations, health info, or other unrelated history.
const SIMULATED_IMPORT_TAGS = ["Trivia nights", "Weekend markets", "Photography walks", "Board game cafes"];

export interface ContextImportStepProps {
  optedIn: boolean;
  tags: string[];
  onOptIn: () => void;
  onOptOut: () => void;
  onRemoveTag: (tag: string) => void;
}

export function ContextImportStep({ optedIn, tags, onOptIn, onOptOut, onRemoveTag }: ContextImportStepProps) {
  const [loading, setLoading] = React.useState(false);

  function handleOptIn() {
    setLoading(true);
    window.setTimeout(() => {
      setLoading(false);
      onOptIn();
    }, 600);
  }

  return (
    <>
      <p className="text-sm text-muted-foreground">
        Optionally preview importing hobbies and interests from a connected source. This is a{" "}
        <strong className="text-foreground">simulated preview</strong> for this build — not a live
        integration. Nothing is imported until you approve it below, and you can delete anything,
        anytime.
      </p>

      {!optedIn && !loading && (
        <button
          type="button"
          onClick={handleOptIn}
          className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-border px-4 py-3 text-sm text-muted-foreground transition-colors hover:border-[var(--accent)] hover:text-foreground"
        >
          <Import className="size-4" />
          Preview context import
        </button>
      )}

      {loading && (
        <div className="flex flex-col gap-2">
          {[0, 1].map((i) => (
            <div key={i} className="h-7 w-36 animate-pulse rounded-full bg-muted" />
          ))}
        </div>
      )}

      {optedIn && !loading && (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1.5 rounded-full bg-[var(--accent)]/15 px-3 py-1.5 text-sm text-foreground"
              >
                {tag}
                <button
                  type="button"
                  onClick={() => onRemoveTag(tag)}
                  aria-label={`Remove ${tag}`}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="size-3.5" />
                </button>
              </span>
            ))}
            {tags.length === 0 && (
              <p className="text-sm text-muted-foreground">All imported tags removed.</p>
            )}
          </div>
          <button
            type="button"
            onClick={onOptOut}
            className="self-start text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            Revoke — don&apos;t import anything
          </button>
        </div>
      )}
    </>
  );
}

export { SIMULATED_IMPORT_TAGS };
