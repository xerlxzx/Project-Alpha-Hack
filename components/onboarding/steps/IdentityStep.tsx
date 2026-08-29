"use client";

import * as React from "react";
import Image from "next/image";
import { Camera } from "lucide-react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { AGE_RANGES, type AgeRange, type OnboardingState } from "@/components/onboarding/types";

export interface IdentityStepProps {
  value: Pick<OnboardingState, "firstName" | "ageRange" | "photoPreviewUrl">;
  onChange: (patch: Partial<OnboardingState>) => void;
  onPhotoSelected: (file: File) => void;
  photoError: string | null;
}

export function IdentityStep({ value, onChange, onPhotoSelected, photoError }: IdentityStepProps) {
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  return (
    <>
      <div className="flex flex-col items-center gap-3">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="group relative flex size-24 items-center justify-center overflow-hidden rounded-full border-2 border-dashed border-border bg-muted text-muted-foreground transition-colors hover:border-[var(--accent)]"
          aria-label="Upload profile photo"
        >
          {value.photoPreviewUrl ? (
            <Image
              src={value.photoPreviewUrl}
              alt="Profile preview"
              fill
              sizes="96px"
              className="object-cover"
              unoptimized
            />
          ) : (
            <Camera className="size-6" />
          )}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onPhotoSelected(file);
            e.target.value = "";
          }}
        />
        <span className="text-xs text-muted-foreground">
          {value.photoPreviewUrl ? "Tap to change photo" : "Add a profile photo"}
        </span>
        {photoError && <span className="text-xs text-destructive">{photoError}</span>}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="firstName" className="text-sm font-medium">
          First name
        </label>
        <Input
          id="firstName"
          autoFocus
          value={value.firstName}
          onChange={(e) => onChange({ firstName: e.target.value })}
          placeholder="Alex"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Age range</span>
        <div className="flex flex-wrap gap-2">
          {AGE_RANGES.map((range) => (
            <button
              key={range}
              type="button"
              onClick={() => onChange({ ageRange: range as AgeRange })}
              className={cn(
                "rounded-full border px-3.5 py-1.5 text-sm transition-colors",
                value.ageRange === range
                  ? "border-transparent bg-[var(--accent)] text-[var(--accent-foreground)]"
                  : "border-border hover:bg-muted"
              )}
            >
              {range}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
