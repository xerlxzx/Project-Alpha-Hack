// Local onboarding-flow state. Deliberately separate from lib/types.ts (DB
// domain types) — this shape is UI-only and gets translated into the DB
// shape by app/onboarding/actions.ts at save time.

export const AGE_RANGES = ["18-20", "21-23", "24-26", "27+"] as const;
export type AgeRange = (typeof AGE_RANGES)[number];

export const HOBBY_OPTIONS = [
  "Basketball",
  "Coffee",
  "Board games",
  "Live music",
  "Hiking",
  "Rock climbing",
  "Food exploration",
  "Gym",
  "Photography",
  "Gaming",
  "Reading",
  "Art & museums",
] as const;

export interface MoreFields {
  languagePref: string;
  genderPref: string;
  accessibility: string;
  socialEnergy: string;
  /** Collected per PRD §9.2 but no `preferences` column exists for it yet —
   * kept local-only, not sent to saveOnboarding. See task-4.2-report.md. */
  groupSizePref: string;
}

export interface LocationValue {
  lat: number | null;
  lng: number | null;
  label: string | null;
}

export interface OnboardingState {
  firstName: string;
  ageRange: AgeRange | "";
  photoFile: File | null;
  photoPreviewUrl: string | null;
  photoUrl: string | null;
  university: string;
  location: LocationValue;
  travelKm: number;
  budgetAud: number;
  availabilityMode: "im_free" | "plan_ahead";
  availabilityStartLocal: string;
  availabilityDurationHours: number;
  hobbies: string[];
  freeText: string;
  extractedTags: string[];
  tagsApproved: boolean;
  contextImportOptedIn: boolean;
  contextImportTags: string[];
  contextImportApproved: boolean;
  more: MoreFields;
}

export const initialOnboardingState: OnboardingState = {
  firstName: "",
  ageRange: "",
  photoFile: null,
  photoPreviewUrl: null,
  photoUrl: null,
  university: "",
  location: { lat: null, lng: null, label: null },
  travelKm: 5,
  budgetAud: 25,
  availabilityMode: "im_free",
  availabilityStartLocal: "",
  availabilityDurationHours: 2,
  hobbies: [],
  freeText: "",
  extractedTags: [],
  tagsApproved: false,
  contextImportOptedIn: false,
  contextImportTags: [],
  contextImportApproved: false,
  more: {
    languagePref: "",
    genderPref: "",
    accessibility: "",
    socialEnergy: "",
    groupSizePref: "",
  },
};

// Camperdown (University of Sydney) — used when geolocation is denied/
// unavailable so the flow never blocks on a required input.
export const CAMPERDOWN_FALLBACK: LocationValue = {
  lat: -33.8886,
  lng: 151.1873,
  label: "Camperdown, NSW (approximate)",
};
