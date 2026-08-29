"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { MoreFields, OnboardingState } from "@/components/onboarding/types";

export interface PreferencesStepProps {
  value: Pick<
    OnboardingState,
    "travelKm" | "budgetAud" | "availabilityMode" | "availabilityStartLocal" | "availabilityDurationHours" | "more"
  >;
  onChange: (patch: Partial<OnboardingState>) => void;
}

export function PreferencesStep({ value, onChange }: PreferencesStepProps) {
  const [moreOpen, setMoreOpen] = React.useState(false);

  function patchMore(patch: Partial<MoreFields>) {
    onChange({ more: { ...value.more, ...patch } });
  }

  return (
    <>
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between text-sm font-medium">
          <span>Preferred travel distance</span>
          <span className="text-muted-foreground">{value.travelKm} km</span>
        </div>
        <input
          type="range"
          min={1}
          max={25}
          value={value.travelKm}
          onChange={(e) => onChange({ travelKm: Number(e.target.value) })}
          className="accent-[var(--accent)]"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between text-sm font-medium">
          <span>Typical budget</span>
          <span className="text-muted-foreground">${value.budgetAud} AUD</span>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={value.budgetAud}
          onChange={(e) => onChange({ budgetAud: Number(e.target.value) })}
          className="accent-[var(--accent)]"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Availability</span>
        <div className="flex gap-2">
          {(["im_free", "plan_ahead"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => onChange({ availabilityMode: mode })}
              className={cn(
                "flex-1 rounded-lg border px-3 py-2 text-sm transition-colors",
                value.availabilityMode === mode
                  ? "border-transparent bg-[var(--accent)] text-[var(--accent-foreground)]"
                  : "border-border hover:bg-muted"
              )}
            >
              {mode === "im_free" ? "I'm free later today" : "Plan ahead"}
            </button>
          ))}
        </div>
        {value.availabilityMode === "plan_ahead" && (
          <Input
            type="datetime-local"
            value={value.availabilityStartLocal}
            onChange={(e) => onChange({ availabilityStartLocal: e.target.value })}
            className="mt-1"
          />
        )}
        <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
          <span>Max duration</span>
          <span>{value.availabilityDurationHours}h</span>
        </div>
        <input
          type="range"
          min={1}
          max={6}
          value={value.availabilityDurationHours}
          onChange={(e) => onChange({ availabilityDurationHours: Number(e.target.value) })}
          className="accent-[var(--accent)]"
        />
      </div>

      <div className="border-t pt-3">
        <button
          type="button"
          onClick={() => setMoreOpen((v) => !v)}
          className="flex w-full items-center justify-between text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          More (optional)
          <ChevronDown className={cn("size-4 transition-transform", moreOpen && "rotate-180")} />
        </button>
        {moreOpen && (
          <div className="mt-3 flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-muted-foreground">Language preference</label>
              <Input
                value={value.more.languagePref}
                onChange={(e) => patchMore({ languagePref: e.target.value })}
                placeholder="e.g. English"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-muted-foreground">Gender preference</label>
              <Input
                value={value.more.genderPref}
                onChange={(e) => patchMore({ genderPref: e.target.value })}
                placeholder="No preference"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-muted-foreground">Accessibility requirements</label>
              <Input
                value={value.more.accessibility}
                onChange={(e) => patchMore({ accessibility: e.target.value })}
                placeholder="None"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-muted-foreground">Preferred group size (3–6)</label>
              <Input
                value={value.more.groupSizePref}
                onChange={(e) => patchMore({ groupSizePref: e.target.value })}
                placeholder="4"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-muted-foreground">Current social energy</label>
              <Input
                value={value.more.socialEnergy}
                onChange={(e) => patchMore({ socialEnergy: e.target.value })}
                placeholder="e.g. Low-key"
              />
            </div>
          </div>
        )}
      </div>
    </>
  );
}
