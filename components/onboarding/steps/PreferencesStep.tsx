"use client";

import * as React from "react";
import { Select } from "@base-ui/react/select";
import { CalendarDays, Check, ChevronDown, Clock3, MapPin, WalletCards, type LucideIcon } from "lucide-react";

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

interface Option {
  value: number;
  label: string;
}

const TRAVEL_OPTIONS: Option[] = [
  { value: 2, label: "2 km" },
  { value: 5, label: "5 km" },
  { value: 10, label: "10 km" },
  { value: 15, label: "15 km" },
  { value: 25, label: "25 km" },
  { value: -1, label: "No preference" },
];

const BUDGET_OPTIONS: Option[] = [
  { value: 0, label: "Free" },
  { value: 10, label: "$10" },
  { value: 25, label: "$25" },
  { value: 50, label: "$50" },
  { value: 100, label: "$100+" },
];

const DURATION_OPTIONS: Option[] = [
  { value: 1, label: "1h" },
  { value: 2, label: "2h" },
  { value: 3, label: "3h" },
  { value: 4, label: "4h" },
  { value: 6, label: "6h" },
  { value: -1, label: "No preference" },
];

const WHEEL_ITEM_HEIGHT = 38;

/** Three-row, scroll-snapping picker modeled on the iOS selection wheel. */
function AppleWheel({
  label,
  icon: Icon,
  options,
  value,
  onSelect,
}: {
  label: string;
  icon: LucideIcon;
  options: Option[];
  value: number;
  onSelect: (value: number) => void;
}) {
  const wheelRef = React.useRef<HTMLDivElement>(null);
  const settleTimer = React.useRef<number | undefined>(undefined);
  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === value));

  React.useEffect(() => {
    const wheel = wheelRef.current;
    if (!wheel) return;
    const target = selectedIndex * WHEEL_ITEM_HEIGHT;
    if (Math.abs(wheel.scrollTop - target) > 1) {
      wheel.scrollTo({ top: target, behavior: "smooth" });
    }
  }, [selectedIndex]);

  React.useEffect(() => {
    return () => window.clearTimeout(settleTimer.current);
  }, []);

  function commitNearestOption() {
    window.clearTimeout(settleTimer.current);
    settleTimer.current = window.setTimeout(() => {
      const wheel = wheelRef.current;
      if (!wheel) return;
      const index = Math.max(
        0,
        Math.min(options.length - 1, Math.round(wheel.scrollTop / WHEEL_ITEM_HEIGHT))
      );
      const option = options[index];
      if (option && option.value !== value) onSelect(option.value);
    }, 90);
  }

  return (
    <fieldset className="min-w-0">
      <legend className="mb-2 flex items-center gap-2 px-0.5 text-sm font-semibold text-foreground/85">
        <Icon aria-hidden className="size-4 text-[var(--accent)]" strokeWidth={2} />
        {label}
      </legend>
      <div
        className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-black/20 shadow-inner shadow-black/30"
        style={{ height: WHEEL_ITEM_HEIGHT * 3 }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-2 z-0 rounded-full border border-white/[0.04] bg-white/[0.065] shadow-[0_0_30px_rgba(231,153,19,0.08)]"
          style={{ top: WHEEL_ITEM_HEIGHT, height: WHEEL_ITEM_HEIGHT }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-1/4 bottom-0 z-0 h-8 bg-[var(--accent)]/10 blur-2xl"
        />
        <div
          ref={wheelRef}
          role="listbox"
          aria-label={label}
          onScroll={commitNearestOption}
          className="relative z-10 h-full snap-y snap-mandatory overflow-y-auto overscroll-contain [overflow-anchor:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          <div aria-hidden style={{ height: WHEEL_ITEM_HEIGHT }} />
          {options.map((option) => {
            const active = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => onSelect(option.value)}
                className={cn(
                  "flex w-full snap-center items-center justify-center rounded-full text-sm outline-none transition-[color,opacity,font-weight] duration-200",
                  "focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent)]",
                  active
                    ? "font-semibold text-foreground opacity-100"
                    : "font-medium text-muted-foreground opacity-40 hover:opacity-70"
                )}
                style={{ height: WHEEL_ITEM_HEIGHT }}
              >
                {option.label}
              </button>
            );
          })}
          <div aria-hidden style={{ height: WHEEL_ITEM_HEIGHT }} />
        </div>
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-20"
          style={{
            background:
              "linear-gradient(to bottom, var(--card) 0%, transparent 34%, transparent 66%, var(--card) 100%)",
          }}
        />
      </div>
    </fieldset>
  );
}

interface TextOption {
  value: string;
  label: string;
}

// The first option of each list stores "" so it saves as NULL. Accessibility is
// an exact-match matching gate (accessibilityCompatible in lib/matcher): a
// non-empty "none" string would fence the user off from everyone with no need.
const LANGUAGE_OPTIONS: TextOption[] = [
  { value: "", label: "No preference" },
  { value: "English", label: "English" },
  { value: "Mandarin", label: "Mandarin" },
  { value: "Cantonese", label: "Cantonese" },
  { value: "Arabic", label: "Arabic" },
  { value: "Vietnamese", label: "Vietnamese" },
  { value: "Spanish", label: "Spanish" },
  { value: "Hindi", label: "Hindi" },
  { value: "Korean", label: "Korean" },
  { value: "Japanese", label: "Japanese" },
  { value: "Greek", label: "Greek" },
  { value: "Italian", label: "Italian" },
];

const GENDER_OPTIONS: TextOption[] = [
  { value: "", label: "No preference" },
  { value: "Male", label: "Male" },
  { value: "Female", label: "Female" },
];

const ACCESSIBILITY_OPTIONS: TextOption[] = [
  { value: "", label: "No requirements" },
  { value: "Step-free access", label: "Step-free access" },
  { value: "Wheelchair access", label: "Wheelchair access" },
  { value: "Hearing support", label: "Hearing support" },
  { value: "Vision support", label: "Vision support" },
];

const SOCIAL_ENERGY_OPTIONS: TextOption[] = [
  { value: "", label: "No preference" },
  { value: "low", label: "Low-key" },
  { value: "medium", label: "Balanced" },
  { value: "high", label: "High-energy" },
];

const GROUP_SIZE_OPTIONS: TextOption[] = [
  { value: "3", label: "3 people" },
  { value: "4", label: "4 people" },
  { value: "5", label: "5 people" },
  { value: "6", label: "6 people" },
];

/**
 * Dropdown built on Base UI Select, styled to match the text Input. Values are
 * plain strings; the empty-string option is the neutral default and saves NULL.
 */
function SelectField({
  label,
  options,
  value,
  onSelect,
}: {
  label: string;
  options: TextOption[];
  value: string;
  onSelect: (value: string) => void;
}) {
  const labelFor = (v: string) => options.find((o) => o.value === v)?.label ?? options[0]?.label;

  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm text-muted-foreground">{label}</label>
      <Select.Root value={value} onValueChange={(next) => onSelect(next ?? "")}>
        <Select.Trigger
          className={cn(
            "flex h-12 w-full items-center justify-between gap-2 rounded-full border border-input bg-transparent px-5 text-base transition-colors outline-none",
            "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 data-[popup-open]:border-ring dark:bg-input/30"
          )}
        >
          <Select.Value>{(v: string) => labelFor(v)}</Select.Value>
          <Select.Icon>
            <ChevronDown className="size-4 text-muted-foreground" />
          </Select.Icon>
        </Select.Trigger>
        <Select.Portal>
          <Select.Positioner className="z-50 outline-none" sideOffset={6} alignItemWithTrigger={false}>
            <Select.Popup className="max-h-[min(20rem,var(--available-height))] min-w-[var(--anchor-width)] overflow-y-auto rounded-2xl border border-border bg-popover p-1.5 text-popover-foreground shadow-lg shadow-black/30 outline-none">
              {options.map((opt) => (
                <Select.Item
                  key={opt.value || "none"}
                  value={opt.value}
                  className={cn(
                    "flex cursor-default select-none items-center justify-between gap-3 rounded-full py-2.5 pl-4 pr-3 text-base outline-none",
                    "data-[highlighted]:bg-muted data-[selected]:font-medium"
                  )}
                >
                  <Select.ItemText>{opt.label}</Select.ItemText>
                  <Select.ItemIndicator>
                    <Check className="size-4 text-[var(--accent)]" />
                  </Select.ItemIndicator>
                </Select.Item>
              ))}
            </Select.Popup>
          </Select.Positioner>
        </Select.Portal>
      </Select.Root>
    </div>
  );
}

export function PreferencesStep({ value, onChange }: PreferencesStepProps) {
  const [moreOpen, setMoreOpen] = React.useState(false);

  function patchMore(patch: Partial<MoreFields>) {
    onChange({ more: { ...value.more, ...patch } });
  }

  return (
    <>
      <div className="flex flex-col gap-5">
        <AppleWheel
          label="Travel range"
          icon={MapPin}
          options={TRAVEL_OPTIONS}
          value={value.travelKm}
          onSelect={(travelKm) => onChange({ travelKm })}
        />
        <AppleWheel
          label="Budget"
          icon={WalletCards}
          options={BUDGET_OPTIONS}
          value={value.budgetAud}
          onSelect={(budgetAud) => onChange({ budgetAud })}
        />
        <AppleWheel
          label="Duration"
          icon={Clock3}
          options={DURATION_OPTIONS}
          value={value.availabilityDurationHours}
          onSelect={(availabilityDurationHours) => onChange({ availabilityDurationHours })}
        />
      </div>

      <div className="flex flex-col gap-2.5">
        <span className="text-base font-medium">Availability</span>
        <div className="flex gap-3">
          {(["im_free", "plan_ahead"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => onChange({ availabilityMode: mode })}
              className={cn(
                "min-h-11 flex-1 whitespace-nowrap rounded-full border px-4 py-2.5 text-sm font-semibold transition-[background-color,border-color,color,box-shadow,transform] duration-200 ease-out active:scale-[0.98]",
                value.availabilityMode === mode
                  ? "border-transparent bg-[var(--accent)] text-[var(--accent-foreground)] shadow-[0_10px_28px_rgba(231,153,19,0.18)]"
                  : "border-border bg-white/[0.015] hover:border-white/20 hover:bg-white/[0.05]"
              )}
            >
              {mode === "im_free" ? "Later today" : "Plan ahead"}
            </button>
          ))}
        </div>
        {value.availabilityMode === "plan_ahead" && (
          <div className="mt-1 flex flex-col gap-2.5 rounded-3xl border border-white/[0.08] bg-white/[0.025] p-3.5 shadow-[0_12px_35px_rgba(0,0,0,0.16)]">
            <label
              htmlFor="availability-start"
              className="flex items-center gap-2 text-sm font-medium text-foreground/85"
            >
              <CalendarDays aria-hidden className="size-4 text-[var(--accent)]" />
              Choose a date
            </label>
            <Input
              id="availability-start"
              type="date"
              lang="en-AU"
              value={value.availabilityStartLocal.split("T")[0]}
              onChange={(e) => onChange({ availabilityStartLocal: e.target.value })}
              className="h-14 rounded-full border-white/10 bg-black/20 px-5 text-base shadow-inner shadow-black/25 [color-scheme:dark] focus-visible:border-[var(--accent)] focus-visible:ring-[var(--accent)]/25"
            />
            <p className="text-xs text-muted-foreground">DD/MM/YYYY</p>
          </div>
        )}
      </div>

      <div className="border-t pt-4">
        <button
          type="button"
          onClick={() => setMoreOpen((v) => !v)}
          className="flex min-h-11 w-full items-center justify-between rounded-full px-4 py-2 text-base font-medium text-muted-foreground transition-colors hover:bg-white/[0.04] hover:text-foreground"
        >
          More (optional)
          <ChevronDown className={cn("size-5 transition-transform", moreOpen && "rotate-180")} />
        </button>
        {moreOpen && (
          <div className="mt-3 flex flex-col gap-4">
            <SelectField
              label="Language preference"
              options={LANGUAGE_OPTIONS}
              value={value.more.languagePref}
              onSelect={(languagePref) => patchMore({ languagePref })}
            />
            <SelectField
              label="Gender preference"
              options={GENDER_OPTIONS}
              value={value.more.genderPref}
              onSelect={(genderPref) => patchMore({ genderPref })}
            />
            <SelectField
              label="Accessibility requirements"
              options={ACCESSIBILITY_OPTIONS}
              value={value.more.accessibility}
              onSelect={(accessibility) => patchMore({ accessibility })}
            />
            <SelectField
              label="Preferred group size (3–6)"
              options={GROUP_SIZE_OPTIONS}
              value={value.more.groupSizePref || "4"}
              onSelect={(groupSizePref) => patchMore({ groupSizePref })}
            />
            <SelectField
              label="Current social energy"
              options={SOCIAL_ENERGY_OPTIONS}
              value={value.more.socialEnergy}
              onSelect={(socialEnergy) => patchMore({ socialEnergy })}
            />
          </div>
        )}
      </div>
    </>
  );
}
