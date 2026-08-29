"use client";

import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { MapPin, CheckCircle2, Check, ChevronDown, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { spring } from "@/components/motion/tokens";
import { type LocationValue } from "@/components/onboarding/types";

const UNIVERSITIES = [
  "University of Sydney",
  "UNSW Sydney",
  "University of Technology Sydney",
  "Macquarie University",
  "University of Melbourne",
  "Monash University",
];

const AREA_OPTIONS: LocationValue[] = [
  { label: "Camperdown, NSW", lat: -33.8886, lng: 151.1873 },
  { label: "Newtown, NSW", lat: -33.8978, lng: 151.1784 },
  { label: "Sydney CBD, NSW", lat: -33.8688, lng: 151.2093 },
  { label: "Kensington, NSW", lat: -33.9173, lng: 151.2313 },
  { label: "Ultimo, NSW", lat: -33.8811, lng: 151.1972 },
  { label: "Macquarie Park, NSW", lat: -33.7752, lng: 151.1124 },
  { label: "Melbourne CBD, VIC", lat: -37.8136, lng: 144.9631 },
  { label: "Clayton, VIC", lat: -37.915, lng: 145.1308 },
];

/**
 * Apple-style select: a styled trigger opening a dark, blurred, spring-
 * animated menu. Replaces the native <select>/<datalist> combobox whose OS
 * chrome clashed with the dark theme. Presentation-only over a string value.
 */
function UniversityDropdown({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const reduce = useReducedMotion();
  const [open, setOpen] = React.useState(false);
  const [active, setActive] = React.useState(0);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const listRef = React.useRef<HTMLUListElement>(null);
  const optionRefs = React.useRef<(HTMLLIElement | null)[]>([]);

  // Close on outside click.
  React.useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  // On open, move focus to the list and scroll the active option into view.
  // (The active index is set synchronously in openMenu, not here, to avoid a
  // cascading setState-in-effect.)
  React.useEffect(() => {
    if (!open) return;
    const raf = requestAnimationFrame(() => {
      listRef.current?.focus();
      optionRefs.current[active]?.scrollIntoView({ block: "nearest" });
    });
    return () => cancelAnimationFrame(raf);
    // Only run when the menu transitions open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function openMenu() {
    setActive(Math.max(0, UNIVERSITIES.indexOf(value)));
    setOpen(true);
  }

  function commit(index: number) {
    onChange(UNIVERSITIES[index]);
    setOpen(false);
  }

  function onTriggerKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openMenu();
    }
  }

  function onListKeyDown(e: React.KeyboardEvent) {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActive((i) => Math.min(UNIVERSITIES.length - 1, i + 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setActive((i) => Math.max(0, i - 1));
        break;
      case "Home":
        e.preventDefault();
        setActive(0);
        break;
      case "End":
        e.preventDefault();
        setActive(UNIVERSITIES.length - 1);
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        commit(active);
        break;
      case "Escape":
        e.preventDefault();
        setOpen(false);
        break;
      case "Tab":
        setOpen(false);
        break;
    }
  }

  React.useEffect(() => {
    if (open) optionRefs.current[active]?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={onTriggerKeyDown}
        className={cn(
          "flex min-h-12 w-full items-center justify-between rounded-full border border-border bg-input/30 px-5 py-2 text-left text-base transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-0",
          open && "ring-2 ring-[var(--accent)]"
        )}
      >
        <span className={cn(!value && "text-muted-foreground")}>
          {value || "Select your university"}
        </span>
        <ChevronDown
          className={cn("size-5 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")}
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.ul
            ref={listRef}
            role="listbox"
            aria-label="University / campus"
            tabIndex={-1}
            onKeyDown={onListKeyDown}
            initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: -6 }}
            animate={reduce ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: -6 }}
            transition={spring.snappy}
            style={{ transformOrigin: "top center" }}
            className="absolute z-50 mt-2 max-h-72 w-full overflow-auto rounded-[24px] border border-border/70 bg-popover/95 p-2 shadow-2xl backdrop-blur-xl focus:outline-none"
          >
            {UNIVERSITIES.map((u, i) => {
              const selected = u === value;
              const highlighted = i === active;
              return (
                <li
                  key={u}
                  ref={(el) => {
                    optionRefs.current[i] = el;
                  }}
                  role="option"
                  aria-selected={selected}
                  onClick={() => commit(i)}
                  onPointerEnter={() => setActive(i)}
                  className={cn(
                    "flex min-h-12 cursor-pointer items-center justify-between gap-2 rounded-full px-4 py-2.5 text-base transition-colors",
                    highlighted ? "bg-[var(--accent)]/15 text-foreground" : "text-foreground/90"
                  )}
                >
                  <span>{u}</span>
                  {selected && <Check className="size-5 shrink-0 text-[var(--accent)]" />}
                </li>
              );
            })}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}

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
  const [areaQuery, setAreaQuery] = React.useState(location.label ?? "");
  const [searchFocused, setSearchFocused] = React.useState(false);
  const [locationError, setLocationError] = React.useState<string | null>(null);

  const normalizedQuery = areaQuery.trim().toLowerCase();
  const matchingAreas = AREA_OPTIONS.filter((area) =>
    area.label?.toLowerCase().includes(normalizedQuery)
  ).slice(0, 5);

  function chooseArea(area: LocationValue) {
    setAreaQuery(area.label ?? "");
    setLocationError(null);
    onLocationChange(area);
    setSearchFocused(false);
  }

  function useDeviceLocation() {
    setLocationError(null);
    if (!("geolocation" in navigator)) {
      setLocationError("Location access is unavailable. Search for an area or leave this blank.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const next = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          label: "Current approximate location",
        };
        setAreaQuery(next.label);
        onLocationChange(next);
      },
      () => setLocationError("Couldn't access your location. Search for an area or leave this blank."),
      { enableHighAccuracy: false, timeout: 5000 }
    );
  }

  return (
    <>
      <div className="flex flex-col gap-2">
        <span id="university-label" className="text-base font-medium">
          University / campus
        </span>
        <UniversityDropdown value={university} onChange={onUniversityChange} />
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-base font-medium">Approximate location <span className="font-normal text-muted-foreground">(optional)</span></span>
        <p className="text-sm text-muted-foreground">
          Search by suburb or area, use your device location, or leave this blank.
        </p>
        <div className="relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 z-10 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={areaQuery}
            onChange={(e) => setAreaQuery(e.target.value)}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => window.setTimeout(() => setSearchFocused(false), 120)}
            placeholder="Search suburb or area"
            aria-label="Search suburb or area"
            aria-expanded={searchFocused && matchingAreas.length > 0}
            aria-controls="area-search-results"
            className="rounded-full pl-11 pr-5"
          />
          {searchFocused && matchingAreas.length > 0 && (
            <div
              id="area-search-results"
              role="listbox"
              aria-label="Area suggestions"
              className="absolute z-40 mt-2 flex w-full flex-col gap-1 rounded-[24px] border border-border/70 bg-black p-2 shadow-2xl"
            >
              {matchingAreas.map((area) => (
                <button
                  key={area.label}
                  type="button"
                  role="option"
                  aria-selected={area.label === location.label}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => chooseArea(area)}
                  className="min-h-11 rounded-full px-4 py-2 text-left text-sm transition-colors hover:bg-white/10"
                >
                  {area.label}
                </button>
              ))}
            </div>
          )}
        </div>
        <Button
          type="button"
          variant="outline"
          className="h-12 justify-start gap-2 rounded-full px-5 text-base"
          onClick={useDeviceLocation}
        >
          <MapPin className="size-5" />
          {location.lat !== null ? "Update my location" : "Use my location"}
        </Button>
        {location.lat !== null && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <CheckCircle2 className="size-4 text-success" />
            {location.label ?? "Location set"}
          </div>
        )}
        {locationError && <p className="text-sm text-muted-foreground">{locationError}</p>}
        {location.lat !== null ? (
          <button
            type="button"
            onClick={() => {
              setAreaQuery("");
              onLocationChange({ lat: null, lng: null, label: null });
            }}
            className="min-h-11 self-start py-2 text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            Clear location
          </button>
        ) : (
          <p className="text-xs text-muted-foreground">You can continue without adding a location.</p>
        )}
      </div>
    </>
  );
}
