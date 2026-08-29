"use client";

import * as React from "react";
import { X, Sparkles } from "lucide-react";

import { Input } from "@/components/ui/input";

export interface TagReviewStepProps {
  tags: string[];
  loading: boolean;
  error: string | null;
  onAddTag: (tag: string) => void;
  onRemoveTag: (tag: string) => void;
}

export function TagReviewStep({ tags, loading, error, onAddTag, onRemoveTag }: TagReviewStepProps) {
  const [draft, setDraft] = React.useState("");

  function addDraft() {
    const trimmed = draft.trim();
    if (!trimmed) return;
    onAddTag(trimmed);
    setDraft("");
  }

  return (
    <>
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Sparkles className="size-4 text-[var(--accent)]" />
        Gemini turned your answer into tags — edit anything that&apos;s off before saving.
      </div>

      {loading && (
        <div className="flex flex-col gap-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-7 w-32 animate-pulse rounded-full bg-muted" />
          ))}
        </div>
      )}

      {!loading && error && <p className="text-sm text-destructive">{error}</p>}

      {!loading && (
        <div className="flex flex-wrap gap-2">
          {tags.length === 0 && (
            <p className="text-sm text-muted-foreground">No tags yet — add some below.</p>
          )}
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
        </div>
      )}

      <div className="flex gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addDraft();
            }
          }}
          placeholder="Add a tag"
        />
        <button
          type="button"
          onClick={addDraft}
          className="shrink-0 rounded-lg border border-border px-3 text-sm hover:bg-muted"
        >
          Add
        </button>
      </div>
    </>
  );
}
