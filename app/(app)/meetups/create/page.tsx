"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

// Preset areas → coarse lat/lng, so the form can feed the matcher/venue
// agent a group centroid without a geocoder. Coords match the seed's
// Sydney-campus clustering (supabase/seed.sql).
const AREA_PRESETS = [
  { label: "University of Sydney", lat: -33.8886, lng: 151.1873 },
  { label: "UNSW", lat: -33.9173, lng: 151.2313 },
  { label: "UTS / Central", lat: -33.8838, lng: 151.2003 },
  { label: "Sydney CBD", lat: -33.8688, lng: 151.2093 },
] as const;

const SIZE_OPTIONS = [3, 4, 5, 6] as const;

const fieldClass =
  "w-full rounded-xl border border-border bg-card px-3 py-2.5 text-base text-foreground outline-none ring-[var(--accent)] placeholder:text-muted-foreground focus-visible:ring-2";

export default function CreateMeetupPage() {
  const router = useRouter();
  const [activityIntent, setActivityIntent] = React.useState("");
  const [scheduledAt, setScheduledAt] = React.useState("");
  const [areaIndex, setAreaIndex] = React.useState<number | null>(null);
  const [costMin, setCostMin] = React.useState("");
  const [costMax, setCostMax] = React.useState("");
  const [sizeCap, setSizeCap] = React.useState<number>(6);
  const [tagsInput, setTagsInput] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (!activityIntent.trim()) {
      setError("Tell us what you'd like to do.");
      return;
    }

    const min = costMin.trim() ? Number(costMin) : null;
    const max = costMax.trim() ? Number(costMax) : null;
    if ((min != null && Number.isNaN(min)) || (max != null && Number.isNaN(max))) {
      setError("Cost must be a number.");
      return;
    }
    if (min != null && max != null && min > max) {
      setError("Minimum cost can't be more than the maximum.");
      return;
    }

    const area = areaIndex != null ? AREA_PRESETS[areaIndex] : null;
    const tags = tagsInput
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);

    setSubmitting(true);
    try {
      const res = await fetch("/api/meetups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          activityIntent: activityIntent.trim(),
          scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null,
          areaLat: area?.lat ?? null,
          areaLng: area?.lng ?? null,
          costMin: min,
          costMax: max,
          sizeCap,
          tags,
        }),
      });

      const payload = (await res.json().catch(() => ({}))) as {
        id?: string;
        error?: string;
      };

      if (!res.ok) {
        setError(payload.error ?? "Could not create the meetup. Try again.");
        setSubmitting(false);
        return;
      }

      router.push("/meetups");
      router.refresh();
    } catch {
      setError("Network error. Try again.");
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-6 bg-background p-5 pb-24 sm:p-8">
      <header className="flex flex-col gap-3">
        <Link
          href="/meetups"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Back to meetups
        </Link>
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
            Start a meetup
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Say what you want to do. Project Alpha helps you find people and a place.
          </p>
        </div>
      </header>

      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        <Field label="What do you want to do?" htmlFor="activity-intent" required>
          <textarea
            id="activity-intent"
            value={activityIntent}
            onChange={(e) => setActivityIntent(e.target.value)}
            required
            maxLength={280}
            rows={3}
            placeholder="e.g. Sunset bouldering session then cheap eats"
            className={cn(fieldClass, "resize-none")}
          />
        </Field>

        <Field label="When?" htmlFor="scheduled-at">
          <input
            id="scheduled-at"
            type="datetime-local"
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
            className={fieldClass}
          />
          <p className="mt-1.5 text-xs text-muted-foreground">
            Leave blank if you&apos;re flexible.
          </p>
        </Field>

        <Field label="Approximate area">
          <div className="flex flex-wrap gap-2">
            {AREA_PRESETS.map((preset, i) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => setAreaIndex(areaIndex === i ? null : i)}
                aria-pressed={areaIndex === i}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-sm transition-colors",
                  areaIndex === i
                    ? "border-[var(--accent)] bg-[var(--accent)]/10 text-foreground"
                    : "border-border bg-card text-muted-foreground hover:text-foreground",
                )}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Cost per person">
          <div className="flex items-center gap-3">
            <CostInput
              id="cost-min"
              label="Minimum cost"
              value={costMin}
              onChange={setCostMin}
              placeholder="Min"
            />
            <span className="text-sm text-muted-foreground">to</span>
            <CostInput
              id="cost-max"
              label="Maximum cost"
              value={costMax}
              onChange={setCostMax}
              placeholder="Max"
            />
          </div>
        </Field>

        <Field label="Group size (including you)">
          <div className="flex gap-2">
            {SIZE_OPTIONS.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setSizeCap(n)}
                aria-pressed={sizeCap === n}
                className={cn(
                  "h-10 flex-1 rounded-xl border text-sm font-medium transition-colors",
                  sizeCap === n
                    ? "border-[var(--accent)] bg-[var(--accent)]/10 text-foreground"
                    : "border-border bg-card text-muted-foreground hover:text-foreground",
                )}
              >
                {n}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Tags" htmlFor="tags">
          <input
            id="tags"
            value={tagsInput}
            onChange={(e) => setTagsInput(e.target.value)}
            placeholder="climbing, food, casual"
            className={fieldClass}
          />
          <p className="mt-1.5 text-xs text-muted-foreground">
            Comma-separated. Helps matching find the right people.
          </p>
        </Field>

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-[var(--accent)] px-6 text-base font-semibold text-[var(--accent-foreground)] shadow-lg shadow-[var(--accent)]/25 transition-transform hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-60 disabled:hover:translate-y-0"
        >
          {submitting && <Loader2 className="size-4 animate-spin" aria-hidden />}
          {submitting ? "Creating…" : "Create meetup"}
        </button>
      </form>
    </div>
  );
}

function Field({
  label,
  htmlFor,
  required,
  children,
}: {
  label: string;
  htmlFor?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={htmlFor} className="text-sm font-medium text-foreground">
        {label}
        {required && <span className="text-[var(--accent)]"> *</span>}
      </label>
      {children}
    </div>
  );
}

function CostInput({
  id,
  label,
  value,
  onChange,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <div className="relative flex-1">
      <span
        aria-hidden
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
      >
        $
      </span>
      <input
        id={id}
        aria-label={label}
        type="number"
        inputMode="numeric"
        min={0}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(fieldClass, "pl-7")}
      />
    </div>
  );
}
