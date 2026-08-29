"use client";

import { MapPin, CheckCircle2 } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CAMPERDOWN_FALLBACK, type LocationValue } from "@/components/onboarding/types";

const UNIVERSITIES = [
  "University of Sydney",
  "UNSW Sydney",
  "University of Technology Sydney",
  "Macquarie University",
  "University of Melbourne",
  "Monash University",
];

export interface LocationStepProps {
  university: string;
  location: LocationValue;
  onUniversityChange: (value: string) => void;
  onLocationChange: (value: LocationValue) => void;
}

export function LocationStep({
  university,
  location,
  onUniversityChange,
  onLocationChange,
}: LocationStepProps) {
  function useDeviceLocation() {
    if (!("geolocation" in navigator)) {
      onLocationChange(CAMPERDOWN_FALLBACK);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        onLocationChange({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          label: "Current approximate location",
        }),
      () => onLocationChange(CAMPERDOWN_FALLBACK),
      { enableHighAccuracy: false, timeout: 5000 }
    );
  }

  return (
    <>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="university" className="text-sm font-medium">
          University / campus
        </label>
        <Input
          id="university"
          list="university-options"
          value={university}
          onChange={(e) => onUniversityChange(e.target.value)}
          placeholder="University of Sydney"
        />
        <datalist id="university-options">
          {UNIVERSITIES.map((u) => (
            <option key={u} value={u} />
          ))}
        </datalist>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Approximate location</span>
        <p className="text-xs text-muted-foreground">
          Used to find nearby meetups — never your exact address.
        </p>
        <Button
          type="button"
          variant="outline"
          className="justify-start gap-2"
          onClick={useDeviceLocation}
        >
          <MapPin className="size-4" />
          {location.lat !== null ? "Update my location" : "Use my location"}
        </Button>
        {location.lat !== null && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <CheckCircle2 className="size-3.5 text-[var(--accent)]" />
            {location.label ?? "Location set"}
          </div>
        )}
        {location.lat === null && (
          <button
            type="button"
            onClick={() => onLocationChange(CAMPERDOWN_FALLBACK)}
            className="self-start text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            Skip — use Camperdown as an approximate default
          </button>
        )}
      </div>
    </>
  );
}
