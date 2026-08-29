"use client";

import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { X, Plus, Sparkles, Loader2, ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";
import { spring } from "@/components/motion/tokens";
import { suggestInterests } from "@/app/onboarding/actions";
import { ContextImportStep } from "@/components/onboarding/steps/ContextImportStep";

export interface InterestsStepProps {
  interests: string[];
  onChange: (interests: string[]) => void;
  personalized: boolean;
  personalizedInterests: string[];
  onPersonalize: (interests: string[]) => void;
  onClearPersonalization: () => void;
  onRemovePersonalizedInterest: (interest: string) => void;
}

/** Broad categories with example interests, not a fixed menu: tap an example
 *  to add it, or type your own. */
const CATEGORIES: { label: string; items: string[] }[] = [
  { label: "Sports & fitness", items: ["Basketball", "Gym", "Running", "Rock climbing", "Tennis", "Yoga"] },
  { label: "Food & drink", items: ["Coffee", "Food exploration", "Brunch", "Cooking", "Bubble tea"] },
  { label: "Music & nightlife", items: ["Live music", "Gigs", "Karaoke", "Dancing"] },
  { label: "Outdoors", items: ["Hiking", "Beach", "Cycling", "Picnics", "Camping"] },
  { label: "Arts & culture", items: ["Art & museums", "Photography", "Film", "Theatre"] },
  { label: "Games", items: ["Board games", "Gaming", "Trivia", "Chess"] },
  { label: "Learning & tech", items: ["Programming", "Languages", "Workshops", "Reading"] },
  { label: "Chill & social", items: ["Cafes", "Markets", "Walks", "Study sessions"] },
];

function dedupeAppend(list: string[], additions: string[]): string[] {
  const seen = new Set(list.map((t) => t.toLowerCase()));
  const out = [...list];
  for (const raw of additions) {
    const t = raw.trim();
    const key = t.toLowerCase();
    if (!t || seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

export function InterestsStep({
  interests,
  onChange,
  personalized,
  personalizedInterests,
  onPersonalize,
  onClearPersonalization,
  onRemovePersonalizedInterest,
}: InterestsStepProps) {
  const reduce = useReducedMotion();
  const [input, setInput] = React.useState("");
  const [openCategory, setOpenCategory] = React.useState<string | null>(null);
  const [suggesting, setSuggesting] = React.useState(false);
  const [suggestError, setSuggestError] = React.useState<string | null>(null);
  const [personalizeOpen, setPersonalizeOpen] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const has = React.useCallback(
    (tag: string) => interests.some((t) => t.toLowerCase() === tag.toLowerCase()),
    [interests]
  );

  function add(raw: string) {
    // Split on commas so pasting "a, b, c" adds three chips at once.
    const parts = raw.split(",");
    const next = dedupeAppend(interests, parts);
    if (next.length !== interests.length) onChange(next);
  }

  function commitInput() {
    if (input.trim()) {
      add(input);
      setInput("");
    }
  }

  function remove(tag: string) {
    onChange(interests.filter((t) => t !== tag));
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      commitInput();
    } else if (e.key === "Backspace" && input === "" && interests.length > 0) {
      // Backspace on an empty field removes the last chip.
      remove(interests[interests.length - 1]);
    }
  }

  async function handleSuggest() {
    setSuggesting(true);
    setSuggestError(null);
    const result = await suggestInterests(interests);
    setSuggesting(false);
    if (result.error) setSuggestError(result.error);
    if (result.tags.length) onChange(dedupeAppend(interests, result.tags));
  }

  return (
    <>
      <div className="flex flex-col gap-2.5">
        <span className="text-base font-medium">What are you into?</span>
        <p className="text-sm text-muted-foreground">
          Type anything and hit enter, or tap a suggestion below.
        </p>

        {/* Growing tag field: chips wrap and the box grows with them. */}
        <div
          onClick={() => inputRef.current?.focus()}
          className="flex min-h-14 w-full cursor-text flex-wrap items-center gap-2 rounded-xl border border-input bg-transparent px-3 py-2.5 text-base focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 dark:bg-input/30"
        >
          <AnimatePresence initial={false}>
            {interests.map((tag) => (
              <motion.span
                key={tag}
                layout={!reduce}
                initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.85 }}
                transition={spring.snappy}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-[var(--accent)] py-1 pl-3.5 pr-2 text-sm text-[var(--accent-foreground)]"
              >
                {tag}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    remove(tag);
                  }}
                  aria-label={`Remove ${tag}`}
                  className="flex size-6 items-center justify-center rounded-full hover:bg-black/15"
                >
                  <X className="size-3.5" />
                </button>
              </motion.span>
            ))}
          </AnimatePresence>
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            onBlur={commitInput}
            placeholder={interests.length ? "Add another…" : "e.g. badminton, photography, live music"}
            className="min-w-[8ch] flex-1 bg-transparent py-1.5 text-base outline-none placeholder:text-muted-foreground"
          />
        </div>

        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={handleSuggest}
            disabled={suggesting || interests.length === 0}
            className="inline-flex min-h-11 items-center gap-2 rounded-full py-2 text-sm font-medium text-info transition-colors hover:opacity-80 disabled:opacity-40"
          >
            {suggesting ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            Suggest more from these
          </button>
          {suggestError && <span className="text-sm text-muted-foreground">{suggestError}</span>}
        </div>
      </div>

      {/* Category suggestions: tap to expand related ideas, or type your own. */}
      <div className="flex flex-col gap-2.5">
        <span className="text-sm font-medium text-muted-foreground">Browse by vibe</span>
        <div className="flex flex-col gap-2">
          {CATEGORIES.map((cat) => {
            const open = openCategory === cat.label;
            return (
              <div key={cat.label} className="rounded-xl border border-border">
                <button
                  type="button"
                  onClick={() => setOpenCategory(open ? null : cat.label)}
                  className="flex min-h-12 w-full items-center justify-between px-4 py-2.5 text-left text-base"
                  aria-expanded={open}
                >
                  {cat.label}
                  <ChevronDown className={cn("size-5 text-muted-foreground transition-transform", open && "rotate-180")} />
                </button>
                <AnimatePresence initial={false}>
                  {open && (
                    <motion.div
                      initial={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
                      animate={reduce ? { opacity: 1 } : { height: "auto", opacity: 1 }}
                      exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
                      transition={spring.gentle}
                      className="overflow-hidden"
                    >
                      <div className="flex flex-wrap gap-2 px-4 pb-3.5">
                        {cat.items.map((item) => {
                          const active = has(item);
                          return (
                            <button
                              key={item}
                              type="button"
                              onClick={() => (active ? remove(item) : add(item))}
                              className={cn(
                                "inline-flex min-h-11 items-center gap-1.5 rounded-full border px-4 py-2 text-sm transition-colors",
                                active
                                  ? "border-transparent bg-[var(--accent)] text-[var(--accent-foreground)]"
                                  : "border-border hover:bg-muted"
                              )}
                            >
                              {!active && <Plus className="size-3.5 opacity-60" />}
                              {item}
                            </button>
                          );
                        })}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </div>

      <div className="border-t pt-4">
        <button
          type="button"
          onClick={() => setPersonalizeOpen((open) => !open)}
          aria-expanded={personalizeOpen}
          className="flex min-h-12 w-full items-center justify-between rounded-full px-4 py-2 text-left transition-colors hover:bg-white/[0.04]"
        >
          <span className="flex flex-col gap-0.5">
            <span className="text-base font-medium">Personalize (optional)</span>
            <span className="text-xs text-muted-foreground">Paste interests from an AI you use</span>
          </span>
          <ChevronDown
            className={cn(
              "size-5 shrink-0 text-muted-foreground transition-transform",
              personalizeOpen && "rotate-180"
            )}
          />
        </button>
        <AnimatePresence initial={false}>
          {personalizeOpen && (
            <motion.div
              initial={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
              animate={reduce ? { opacity: 1 } : { height: "auto", opacity: 1 }}
              exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
              transition={spring.gentle}
              className="overflow-hidden"
            >
              <div className="pt-4">
                <ContextImportStep
                  optedIn={personalized}
                  tags={personalizedInterests}
                  onImport={onPersonalize}
                  onOptOut={onClearPersonalization}
                  onRemoveTag={onRemovePersonalizedInterest}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  );
}
