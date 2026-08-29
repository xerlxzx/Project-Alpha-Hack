"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";

import { SelectField } from "@/components/SelectField";
import {
  TRAVEL_OPTIONS,
  BUDGET_OPTIONS,
  LANGUAGE_OPTIONS,
  GENDER_OPTIONS,
  ACCESSIBILITY_OPTIONS,
  SOCIAL_ENERGY_OPTIONS,
  type NumberOption,
} from "@/lib/preference-options";
import { updateMatchingPreferences } from "@/app/(app)/profile/actions";

export interface PreferencesTabProps {
  travelKm: number | null;
  budgetAud: number | null;
  interests: string[];
  genderPref: string | null;
  languagePref: string | null;
  accessibility: string | null;
  socialEnergy: string | null;
}

/** SelectField only speaks string values; these fields are numeric. */
function numberOptionsToText(options: NumberOption[]) {
  return options.map((o) => ({ value: String(o.value), label: o.label }));
}

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

export function PreferencesTab({
  travelKm: initialTravelKm,
  budgetAud: initialBudgetAud,
  interests: initialInterests,
  genderPref: initialGenderPref,
  languagePref: initialLanguagePref,
  accessibility: initialAccessibility,
  socialEnergy: initialSocialEnergy,
}: PreferencesTabProps) {
  const router = useRouter();

  const [travelKm, setTravelKm] = React.useState(initialTravelKm ?? -1);
  const [budgetAud, setBudgetAud] = React.useState(initialBudgetAud ?? 0);
  const [interests, setInterests] = React.useState(initialInterests);
  const [input, setInput] = React.useState("");
  const [genderPref, setGenderPref] = React.useState(initialGenderPref ?? "");
  const [languagePref, setLanguagePref] = React.useState(initialLanguagePref ?? "");
  const [accessibility, setAccessibility] = React.useState(initialAccessibility ?? "");
  const [socialEnergy, setSocialEnergy] = React.useState(initialSocialEnergy ?? "");

  const [saving, setSaving] = React.useState(false);
  const [saved, setSaved] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  function addTags(raw: string) {
    const next = dedupeAppend(interests, raw.split(","));
    if (next.length !== interests.length) setInterests(next);
  }

  function commitInput() {
    if (input.trim()) {
      addTags(input);
      setInput("");
    }
  }

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    setError(null);
    const result = await updateMatchingPreferences({
      travelKm: travelKm === -1 ? null : travelKm,
      budgetAud,
      interests,
      genderPref: genderPref || null,
      languagePref: languagePref || null,
      accessibility: accessibility || null,
      socialEnergy: socialEnergy || null,
    });
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSaved(true);
    router.refresh();
    window.setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="flex flex-col gap-5">
      <SelectField
        label="Travel range"
        options={numberOptionsToText(TRAVEL_OPTIONS)}
        value={String(travelKm)}
        onSelect={(v) => setTravelKm(Number(v))}
      />
      <SelectField
        label="Budget"
        options={numberOptionsToText(BUDGET_OPTIONS)}
        value={String(budgetAud)}
        onSelect={(v) => setBudgetAud(Number(v))}
      />

      <div className="flex flex-col gap-2">
        <label className="text-sm text-muted-foreground">Interests &amp; hobbies</label>
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) commitInput();
          }}
          className="flex min-h-12 w-full flex-wrap items-center gap-2 rounded-xl border border-input bg-transparent px-3 py-2 text-base focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 dark:bg-input/30"
        >
          {interests.map((tag) => (
            <span
              key={tag}
              className="inline-flex min-h-8 items-center gap-1.5 rounded-full bg-[var(--accent)] py-1 pl-3 pr-1.5 text-sm text-[var(--accent-foreground)]"
            >
              {tag}
              <button
                type="button"
                onClick={() => setInterests(interests.filter((t) => t !== tag))}
                aria-label={`Remove ${tag}`}
                className="flex size-5 items-center justify-center rounded-full hover:bg-black/15"
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                commitInput();
              } else if (e.key === "Backspace" && input === "" && interests.length > 0) {
                setInterests(interests.slice(0, -1));
              }
            }}
            onBlur={commitInput}
            placeholder={interests.length ? "Add another…" : "e.g. hiking, board games"}
            className="min-w-[8ch] flex-1 bg-transparent py-1 text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
      </div>

      <SelectField
        label="Gender preference"
        options={GENDER_OPTIONS}
        value={genderPref}
        onSelect={setGenderPref}
      />
      <SelectField
        label="Language preference"
        options={LANGUAGE_OPTIONS}
        value={languagePref}
        onSelect={setLanguagePref}
      />
      <SelectField
        label="Accessibility requirements"
        options={ACCESSIBILITY_OPTIONS}
        value={accessibility}
        onSelect={setAccessibility}
      />
      <SelectField
        label="Current social energy"
        options={SOCIAL_ENERGY_OPTIONS}
        value={socialEnergy}
        onSelect={setSocialEnergy}
      />

      <div className="flex items-center justify-between gap-3 pt-1">
        {error && <span className="text-sm text-destructive">{error}</span>}
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="ml-auto inline-flex min-h-10 items-center justify-center rounded-full bg-[var(--accent)] px-5 text-sm font-semibold text-[var(--accent-foreground)] transition-opacity disabled:opacity-50"
        >
          {saving ? "Saving…" : saved ? "Saved" : "Save"}
        </button>
      </div>
    </div>
  );
}
