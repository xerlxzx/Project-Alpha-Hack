"use client";

import * as React from "react";
import { X, Check, Copy } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

// Copy-paste prompt the user runs against their own ChatGPT/Claude memory. The
// output format (comma-separated tags) is what parseImportedTags() expects.
const EXTRACTION_PROMPT = `You are helping me create activity preferences for a social meetup app.

Source: Use my saved memories.

Task: Identify 4 to 10 hobbies, interests, or social activities I would enjoy doing with other people.

Exclude: Relationships, health, work, finances, identity details, and private information.

Format: Return one comma-separated line of short activity tags. Do not add bullets, numbering, explanations, or text before or after the tags.

Example output: Rock climbing, Live music, Board games, Ramen spots`;

/**
 * Turns pasted memory text into clean interest tags. Accepts the comma or
 * newline separated output the extraction prompt produces (and tolerates
 * bullets/numbering when someone pastes a raw list). Deduped case-insensitively.
 */
function parseImportedTags(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(/[\n,]/)) {
    const tag = part
      .replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "") // strip bullet / "1." prefixes
      .replace(/^["'“”]+|["'“”]+$/g, "") // strip wrapping quotes
      .trim()
      .slice(0, 40);
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
    if (out.length >= 12) break;
  }
  return out;
}

export interface ContextImportStepProps {
  optedIn: boolean;
  tags: string[];
  /** Commit reviewed tags to onboarding state (marks context import opted-in). */
  onImport: (tags: string[]) => void;
  onOptOut: () => void;
  onRemoveTag: (tag: string) => void;
}

export function ContextImportStep({ optedIn, tags, onImport, onOptOut, onRemoveTag }: ContextImportStepProps) {
  const reduce = useReducedMotion();
  const [pasteText, setPasteText] = React.useState("");
  const [promptCopied, setPromptCopied] = React.useState(false);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  // Grow the paste box to fit its content instead of scrolling inside a fixed box.
  React.useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [pasteText]);

  function importPastedText(event: React.ClipboardEvent<HTMLTextAreaElement>) {
    const pastedText = event.clipboardData.getData("text");
    const parsed = parseImportedTags(pastedText);
    if (parsed.length === 0) return;
    event.preventDefault();
    onImport(parsed);
    setPasteText("");
  }

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(EXTRACTION_PROMPT);
      setPromptCopied(true);
      window.setTimeout(() => setPromptCopied(false), 1800);
    } catch {
      // Clipboard unavailable (insecure context / denied); the prompt is still
      // visible below for manual selection, so fail quietly.
    }
  }

  // Review state: tags are imported; user approves by finishing, or revokes.
  if (optedIn) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          Review what was imported. Remove anything you don&apos;t want — nothing is shared with other
          members, and you can revoke it all.
        </p>
        <div className="flex flex-wrap gap-3">
          {tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-[var(--accent)]/15 py-2 pl-4 pr-2 text-base text-foreground"
            >
              {tag}
              <button
                type="button"
                onClick={() => onRemoveTag(tag)}
                aria-label={`Remove ${tag}`}
                className="flex size-8 items-center justify-center rounded-full text-muted-foreground hover:bg-foreground/10 hover:text-foreground"
              >
                <X className="size-4" />
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
          className="min-h-11 self-start py-2 text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground"
        >
          Revoke and import nothing
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Copy the prompt into an AI that stores your memories, then paste its answer below. You can
        review every interest before saving it.
      </p>

      {/* Manual paste path */}
      <div className="flex flex-col gap-2">
        <div className="flex items-start justify-between gap-3 rounded-lg border border-border bg-muted/20 p-3">
          <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
            {EXTRACTION_PROMPT}
          </p>
          <button
            type="button"
            onClick={copyPrompt}
            aria-label={promptCopied ? "Prompt copied" : "Copy prompt"}
            className="flex w-[4.75rem] shrink-0 items-center justify-center gap-1.5 rounded-full border border-border px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <span className="relative size-3.5" aria-hidden>
              <AnimatePresence initial={false} mode="wait">
                {promptCopied ? (
                  <motion.span
                    key="check"
                    className="absolute inset-0"
                    initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.65, rotate: -18 }}
                    animate={{ opacity: 1, scale: 1, rotate: 0 }}
                    exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.65, rotate: 18 }}
                    transition={{ duration: reduce ? 0 : 0.16 }}
                  >
                    <Check className="size-3.5 text-[var(--accent)]" />
                  </motion.span>
                ) : (
                  <motion.span
                    key="copy"
                    className="absolute inset-0"
                    initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.75 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.75 }}
                    transition={{ duration: reduce ? 0 : 0.14 }}
                  >
                    <Copy className="size-3.5" />
                  </motion.span>
                )}
              </AnimatePresence>
            </span>
            Copy
          </button>
        </div>
        <p className="text-xs text-muted-foreground">
          Run that in ChatGPT or Claude (Settings → Personalization → Manage memories), then paste
          what it gives you below.
        </p>
        <textarea
          ref={textareaRef}
          value={pasteText}
          onChange={(e) => setPasteText(e.target.value)}
          onPaste={importPastedText}
          rows={3}
          placeholder="Paste the comma-separated answer here…"
          className="min-h-[76px] w-full resize-none overflow-hidden rounded-lg border border-border bg-background px-3.5 py-3 text-base text-foreground placeholder:text-muted-foreground focus:border-[var(--accent)] focus:outline-none"
        />
      </div>
    </div>
  );
}

export { EXTRACTION_PROMPT, parseImportedTags };
