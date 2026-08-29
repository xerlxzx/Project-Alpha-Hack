"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Camera, Loader2, Minus, Plus } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { AGE_RANGES, type AgeRange } from "@/components/onboarding/types";
import {
  updateProfileBasics,
  updateProfilePhoto,
  updateWeeklyGoal,
} from "@/app/(app)/profile/actions";

export interface ProfileTabProps {
  firstName: string;
  photoUrl: string | null;
  ageRange: string | null;
  university: string;
  courseYear: string | null;
  weeklyGoal: number;
}

function initials(name: string): string {
  return name.trim().slice(0, 1).toUpperCase() || "?";
}

export function ProfileTab({
  firstName: initialFirstName,
  photoUrl: initialPhotoUrl,
  ageRange: initialAgeRange,
  university: initialUniversity,
  courseYear: initialCourseYear,
  weeklyGoal: initialWeeklyGoal,
}: ProfileTabProps) {
  const router = useRouter();
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const [photoUrl, setPhotoUrl] = React.useState(initialPhotoUrl);
  const [uploadingPhoto, setUploadingPhoto] = React.useState(false);
  const [photoError, setPhotoError] = React.useState<string | null>(null);

  const [firstName, setFirstName] = React.useState(initialFirstName);
  const [ageRange, setAgeRange] = React.useState<string | null>(initialAgeRange);
  const [university, setUniversity] = React.useState(initialUniversity);
  const [courseYear, setCourseYear] = React.useState(initialCourseYear ?? "");
  const [savingBasics, setSavingBasics] = React.useState(false);
  const [basicsError, setBasicsError] = React.useState<string | null>(null);
  const [basicsSaved, setBasicsSaved] = React.useState(false);

  const [weeklyGoal, setWeeklyGoal] = React.useState(initialWeeklyGoal);
  const [savingGoal, setSavingGoal] = React.useState(false);

  async function handlePhotoSelected(file: File) {
    setPhotoError(null);
    setUploadingPhoto(true);
    const formData = new FormData();
    formData.set("photo", file);
    const result = await updateProfilePhoto(formData);
    setUploadingPhoto(false);
    if ("error" in result) {
      setPhotoError(result.error);
      return;
    }
    setPhotoUrl(result.url);
    router.refresh();
  }

  async function handleSaveBasics() {
    setSavingBasics(true);
    setBasicsError(null);
    setBasicsSaved(false);
    const result = await updateProfileBasics({
      firstName,
      ageRange,
      university,
      courseYear: courseYear.trim() || null,
    });
    setSavingBasics(false);
    if (!result.ok) {
      setBasicsError(result.error);
      return;
    }
    setBasicsSaved(true);
    router.refresh();
    window.setTimeout(() => setBasicsSaved(false), 2000);
  }

  async function adjustWeeklyGoal(next: number) {
    const clamped = Math.max(1, Math.min(14, next));
    if (clamped === weeklyGoal) return;
    setWeeklyGoal(clamped);
    setSavingGoal(true);
    await updateWeeklyGoal(clamped);
    setSavingGoal(false);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col items-center gap-3">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploadingPhoto}
          className="group relative"
          aria-label="Change profile photo"
        >
          <Avatar size="lg" className="size-20">
            <AvatarImage src={photoUrl ?? undefined} alt="" />
            <AvatarFallback className="text-xl">{initials(firstName)}</AvatarFallback>
          </Avatar>
          <span className="absolute -bottom-1 -right-1 flex size-7 items-center justify-center rounded-full bg-[var(--accent)] text-[var(--accent-foreground)] shadow-sm">
            {uploadingPhoto ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Camera className="size-3.5" />
            )}
          </span>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handlePhotoSelected(file);
            e.target.value = "";
          }}
        />
        {photoError && <span className="text-sm text-destructive">{photoError}</span>}
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <label htmlFor="settings-first-name" className="text-sm text-muted-foreground">
            First name
          </label>
          <Input
            id="settings-first-name"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            className="rounded-full px-5"
          />
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="settings-university" className="text-sm text-muted-foreground">
            University
          </label>
          <Input
            id="settings-university"
            value={university}
            onChange={(e) => setUniversity(e.target.value)}
            className="rounded-full px-5"
          />
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="settings-course-year" className="text-sm text-muted-foreground">
            Course &amp; year (optional)
          </label>
          <Input
            id="settings-course-year"
            value={courseYear}
            onChange={(e) => setCourseYear(e.target.value)}
            placeholder="e.g. Computer Science, 2nd year"
            className="rounded-full px-5"
          />
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-sm text-muted-foreground">Age range</span>
          <div className="flex flex-wrap gap-2">
            {AGE_RANGES.map((range) => (
              <button
                key={range}
                type="button"
                onClick={() => setAgeRange(range as AgeRange)}
                className={cn(
                  "min-h-9 rounded-full border px-4 py-1.5 text-sm transition-colors",
                  ageRange === range
                    ? "border-transparent bg-[var(--accent)] text-[var(--accent-foreground)]"
                    : "border-border hover:bg-muted"
                )}
              >
                {range}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 pt-1">
          {basicsError && <span className="text-sm text-destructive">{basicsError}</span>}
          <button
            type="button"
            onClick={handleSaveBasics}
            disabled={savingBasics || !firstName.trim() || !university.trim()}
            className="ml-auto inline-flex min-h-10 items-center justify-center rounded-full bg-[var(--accent)] px-5 text-sm font-semibold text-[var(--accent-foreground)] transition-opacity disabled:opacity-50"
          >
            {savingBasics ? "Saving…" : basicsSaved ? "Saved" : "Save"}
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-2 border-t border-border pt-5">
        <span className="text-sm font-medium text-foreground">Weekly goal</span>
        <p className="text-xs text-muted-foreground">
          Activities per week that count toward your streak and momentum ring.
        </p>
        <div className="mt-1 flex items-center gap-4">
          <button
            type="button"
            onClick={() => adjustWeeklyGoal(weeklyGoal - 1)}
            disabled={savingGoal || weeklyGoal <= 1}
            aria-label="Decrease weekly goal"
            className="flex size-10 items-center justify-center rounded-full border border-border transition-colors hover:bg-muted disabled:opacity-40"
          >
            <Minus className="size-4" />
          </button>
          <span className="min-w-[3ch] text-center text-lg font-semibold text-foreground">
            {weeklyGoal}
          </span>
          <button
            type="button"
            onClick={() => adjustWeeklyGoal(weeklyGoal + 1)}
            disabled={savingGoal || weeklyGoal >= 14}
            aria-label="Increase weekly goal"
            className="flex size-10 items-center justify-center rounded-full border border-border transition-colors hover:bg-muted disabled:opacity-40"
          >
            <Plus className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
