// Shared option lists for matching-preference fields, used by onboarding
// (components/onboarding/steps/PreferencesStep.tsx) and profile settings
// (components/profile/PreferencesTab.tsx). Keep both in sync with a single
// source since they write the same `preferences` columns.

export interface NumberOption {
  value: number;
  label: string;
}

export interface TextOption {
  value: string;
  label: string;
}

export const TRAVEL_OPTIONS: NumberOption[] = [
  { value: 2, label: "2 km" },
  { value: 5, label: "5 km" },
  { value: 10, label: "10 km" },
  { value: 15, label: "15 km" },
  { value: 25, label: "25 km" },
  { value: -1, label: "No preference" },
];

export const BUDGET_OPTIONS: NumberOption[] = [
  { value: 0, label: "Free" },
  { value: 10, label: "$10" },
  { value: 25, label: "$25" },
  { value: 50, label: "$50" },
  { value: 100, label: "$100+" },
];

// The first option of each list stores "" so it saves as NULL. Accessibility is
// an exact-match matching gate (accessibilityCompatible in lib/matcher): a
// non-empty "none" string would fence the user off from everyone with no need.
export const LANGUAGE_OPTIONS: TextOption[] = [
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

export const GENDER_OPTIONS: TextOption[] = [
  { value: "", label: "No preference" },
  { value: "Male", label: "Male" },
  { value: "Female", label: "Female" },
];

export const ACCESSIBILITY_OPTIONS: TextOption[] = [
  { value: "", label: "No requirements" },
  { value: "Step-free access", label: "Step-free access" },
  { value: "Wheelchair access", label: "Wheelchair access" },
  { value: "Hearing support", label: "Hearing support" },
  { value: "Vision support", label: "Vision support" },
];

export const SOCIAL_ENERGY_OPTIONS: TextOption[] = [
  { value: "", label: "No preference" },
  { value: "low", label: "Low-key" },
  { value: "medium", label: "Balanced" },
  { value: "high", label: "High-energy" },
];
