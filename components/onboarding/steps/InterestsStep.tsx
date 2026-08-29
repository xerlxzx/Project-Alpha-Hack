"use client";

import { cn } from "@/lib/utils";
import { HOBBY_OPTIONS } from "@/components/onboarding/types";

export interface InterestsStepProps {
  hobbies: string[];
  freeText: string;
  onHobbiesChange: (hobbies: string[]) => void;
  onFreeTextChange: (text: string) => void;
}

const FREE_TEXT_MAX_LEN = 500;

export function InterestsStep({
  hobbies,
  freeText,
  onHobbiesChange,
  onFreeTextChange,
}: InterestsStepProps) {
  function toggle(hobby: string) {
    onHobbiesChange(
      hobbies.includes(hobby) ? hobbies.filter((h) => h !== hobby) : [...hobbies, hobby]
    );
  }

  return (
    <>
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Hobbies & interests</span>
        <div className="flex flex-wrap gap-2">
          {HOBBY_OPTIONS.map((hobby) => (
            <button
              key={hobby}
              type="button"
              onClick={() => toggle(hobby)}
              className={cn(
                "rounded-full border px-3.5 py-1.5 text-sm transition-colors",
                hobbies.includes(hobby)
                  ? "border-transparent bg-[var(--accent)] text-[var(--accent-foreground)]"
                  : "border-border hover:bg-muted"
              )}
            >
              {hobby}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="freeText" className="text-sm font-medium">
          What would you like to do more of?
        </label>
        <textarea
          id="freeText"
          value={freeText}
          maxLength={FREE_TEXT_MAX_LEN}
          onChange={(e) => onFreeTextChange(e.target.value)}
          placeholder="Try new cafes, get back into climbing, meet people outside my course…"
          rows={3}
          className="w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-2 text-base outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30"
        />
        <span className="self-end text-xs text-muted-foreground">
          {freeText.length}/{FREE_TEXT_MAX_LEN}
        </span>
      </div>
    </>
  );
}
