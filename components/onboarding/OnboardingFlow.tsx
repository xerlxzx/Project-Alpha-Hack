"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

import { saveOnboarding, uploadProfilePhoto } from "@/app/onboarding/actions";
import { Stepper } from "@/components/onboarding/Stepper";
import { StepShell } from "@/components/onboarding/StepShell";
import { IdentityStep } from "@/components/onboarding/steps/IdentityStep";
import { LocationStep } from "@/components/onboarding/steps/LocationStep";
import { PreferencesStep } from "@/components/onboarding/steps/PreferencesStep";
import { InterestsStep } from "@/components/onboarding/steps/InterestsStep";
import { renderCroppedJpeg, IDENTITY_TRANSFORM } from "@/components/onboarding/resizeImage";
import { initialOnboardingState, type OnboardingState } from "@/components/onboarding/types";
import { spring } from "@/components/motion/tokens";

const STEP_COUNT = 4;

function dedupe(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    const key = v.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(v.trim());
  }
  return out;
}

function computeAvailabilityWindow(state: OnboardingState): { startAt: string; endAt: string } {
  const start =
    state.availabilityMode === "plan_ahead" && state.availabilityStartLocal
      // The UI intentionally captures a date only. Noon local time avoids UTC
      // rollover while keeping the selected calendar day stable.
      ? new Date(`${state.availabilityStartLocal.split("T")[0]}T12:00:00`)
      : new Date();
  // A duration of -1 is the UI's “No preference” sentinel. Give matching a
  // broad one-day window while preserving a concrete end timestamp.
  const durationHours = state.availabilityDurationHours === -1 ? 24 : state.availabilityDurationHours;
  const end = new Date(start.getTime() + durationHours * 60 * 60 * 1000);
  return { startAt: start.toISOString(), endAt: end.toISOString() };
}

export function OnboardingFlow() {
  const router = useRouter();
  const reduce = useReducedMotion();

  const [step, setStep] = React.useState(0);
  const [state, setState] = React.useState<OnboardingState>(initialOnboardingState);

  const [photoUploading, setPhotoUploading] = React.useState(false);
  const [photoError, setPhotoError] = React.useState<string | null>(null);

  const [saveLoading, setSaveLoading] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);

  function patch(partial: Partial<OnboardingState>) {
    setState((prev) => ({ ...prev, ...partial }));
  }

  function handlePhotoSelected(file: File) {
    setPhotoError(null);
    const previewUrl = URL.createObjectURL(file);
    // Reset framing for the newly chosen photo.
    patch({ photoFile: file, photoPreviewUrl: previewUrl, photoUrl: null, photoTransform: IDENTITY_TRANSFORM });
  }

  async function goNextFromIdentity() {
    if (!state.photoFile) {
      patch({});
      setStep((s) => s + 1);
      return;
    }
    setPhotoUploading(true);
    setPhotoError(null);
    try {
      const resized = await renderCroppedJpeg(state.photoFile, state.photoTransform);
      const formData = new FormData();
      formData.set("photo", resized, "profile.jpg");
      const result = await uploadProfilePhoto(formData);
      if ("error" in result) {
        setPhotoError(result.error);
        return;
      }
      patch({ photoUrl: result.url });
      setStep((s) => s + 1);
    } catch {
      setPhotoError("Photo upload failed, try again.");
    } finally {
      setPhotoUploading(false);
    }
  }

  async function finishAndSave() {
    setSaveLoading(true);
    setSaveError(null);

    const interests = dedupe([
      ...state.hobbies,
      ...(state.contextImportOptedIn ? state.contextImportTags : []),
    ]);
    const { startAt, endAt } = computeAvailabilityWindow(state);

    const result = await saveOnboarding({
      firstName: state.firstName,
      photoUrl: state.photoUrl,
      ageRange: state.ageRange || null,
      university: state.university,
      areaLat: state.location.lat,
      areaLng: state.location.lng,
      // `travel_km` is nullable in the preference schema; null means the user
      // opted out of applying a distance constraint.
      travelKm: state.travelKm === -1 ? null : state.travelKm,
      budgetAud: state.budgetAud,
      hobbies: state.hobbies,
      interests,
      availabilityMode: state.availabilityMode,
      availabilityStartAt: startAt,
      availabilityEndAt: endAt,
      languagePref: state.more.languagePref,
      genderPref: state.more.genderPref,
      accessibility: state.more.accessibility,
      socialEnergy: state.more.socialEnergy,
    });

    setSaveLoading(false);
    if (!result.ok) {
      setSaveError(result.error);
      return;
    }
    router.push("/home");
  }

  const identityValid = state.firstName.trim() !== "" && state.ageRange !== "";
  const locationValid = state.university.trim() !== "";
  const preferencesValid = state.availabilityMode === "im_free" || state.availabilityStartLocal !== "";
  const interestsValid = state.hobbies.length > 0 || state.contextImportTags.length > 0;

  const direction = 1;
  const variants = {
    enter: reduce ? { opacity: 0 } : { opacity: 0, x: 24 },
    center: { opacity: 1, x: 0 },
    exit: reduce ? { opacity: 0 } : { opacity: 0, x: -24 },
  };

  return (
    <div className="onboarding-theme min-h-dvh bg-black">
      <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-7 p-6">
        <Stepper step={step} total={STEP_COUNT} />

        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={step}
            custom={direction}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={spring.gentle}
          >
            {step === 0 && (
              <StepShell
                title="Let's set you up"
                description="Takes about a minute."
                onNext={goNextFromIdentity}
                nextDisabled={!identityValid}
                nextLoading={photoUploading}
              >
                <IdentityStep
                  value={state}
                  onChange={patch}
                  onPhotoSelected={handlePhotoSelected}
                  photoError={photoError}
                />
              </StepShell>
            )}

            {step === 1 && (
              <StepShell
                title="Where are you based?"
                onBack={() => setStep(0)}
                onNext={() => setStep(2)}
                nextDisabled={!locationValid}
              >
                <LocationStep
                  university={state.university}
                  location={state.location}
                  onUniversityChange={(university) => patch({ university })}
                  onLocationChange={(location) => patch({ location })}
                />
              </StepShell>
            )}

            {step === 2 && (
              <StepShell
                title="How do you like to meet up?"
                onBack={() => setStep(1)}
                onNext={() => setStep(3)}
                nextDisabled={!preferencesValid}
              >
                <PreferencesStep value={state} onChange={patch} />
              </StepShell>
            )}

            {step === 3 && (
              <StepShell
                title="What are you into?"
                onBack={() => setStep(2)}
                onNext={finishAndSave}
                nextDisabled={!interestsValid}
                nextLoading={saveLoading}
                nextLabel="Finish"
                footerExtra={saveError ? <span className="text-sm text-destructive">{saveError}</span> : undefined}
              >
                <InterestsStep
                  interests={state.hobbies}
                  onChange={(hobbies) => patch({ hobbies })}
                  personalized={state.contextImportOptedIn}
                  personalizedInterests={state.contextImportTags}
                  onPersonalize={(tags) =>
                    patch({ contextImportOptedIn: true, contextImportTags: tags })
                  }
                  onClearPersonalization={() =>
                    patch({ contextImportOptedIn: false, contextImportTags: [] })
                  }
                  onRemovePersonalizedInterest={(tag) =>
                    patch({ contextImportTags: state.contextImportTags.filter((item) => item !== tag) })
                  }
                />
              </StepShell>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
