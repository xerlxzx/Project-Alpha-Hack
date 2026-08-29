"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

import { extractTags, saveOnboarding, uploadProfilePhoto } from "@/app/onboarding/actions";
import { Stepper } from "@/components/onboarding/Stepper";
import { StepShell } from "@/components/onboarding/StepShell";
import { IdentityStep } from "@/components/onboarding/steps/IdentityStep";
import { LocationStep } from "@/components/onboarding/steps/LocationStep";
import { PreferencesStep } from "@/components/onboarding/steps/PreferencesStep";
import { InterestsStep } from "@/components/onboarding/steps/InterestsStep";
import { TagReviewStep } from "@/components/onboarding/steps/TagReviewStep";
import { ContextImportStep, SIMULATED_IMPORT_TAGS } from "@/components/onboarding/steps/ContextImportStep";
import { resizeImageToJpeg } from "@/components/onboarding/resizeImage";
import { initialOnboardingState, type OnboardingState } from "@/components/onboarding/types";
import { spring } from "@/components/motion/tokens";

const STEP_COUNT = 6;

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
      ? new Date(state.availabilityStartLocal)
      : new Date();
  const end = new Date(start.getTime() + state.availabilityDurationHours * 60 * 60 * 1000);
  return { startAt: start.toISOString(), endAt: end.toISOString() };
}

export function OnboardingFlow() {
  const router = useRouter();
  const reduce = useReducedMotion();

  const [step, setStep] = React.useState(0);
  const [state, setState] = React.useState<OnboardingState>(initialOnboardingState);

  const [photoUploading, setPhotoUploading] = React.useState(false);
  const [photoError, setPhotoError] = React.useState<string | null>(null);

  const [extractLoading, setExtractLoading] = React.useState(false);
  const [extractError, setExtractError] = React.useState<string | null>(null);

  const [saveLoading, setSaveLoading] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);

  function patch(partial: Partial<OnboardingState>) {
    setState((prev) => ({ ...prev, ...partial }));
  }

  function handlePhotoSelected(file: File) {
    setPhotoError(null);
    const previewUrl = URL.createObjectURL(file);
    patch({ photoFile: file, photoPreviewUrl: previewUrl, photoUrl: null });
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
      const resized = await resizeImageToJpeg(state.photoFile);
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
      setPhotoError("Photo upload failed — try again.");
    } finally {
      setPhotoUploading(false);
    }
  }

  async function goNextFromInterests() {
    setExtractLoading(true);
    setExtractError(null);
    setStep((s) => s + 1);
    const result = await extractTags(state.freeText);
    setExtractLoading(false);
    if (result.error) setExtractError(result.error);
    patch({ extractedTags: result.tags });
  }

  async function finishAndSave() {
    setSaveLoading(true);
    setSaveError(null);

    const interests = dedupe([
      ...state.extractedTags,
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
      travelKm: state.travelKm,
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

  const identityValid = state.firstName.trim() !== "" && state.ageRange !== "" && state.photoFile !== null;
  const locationValid = state.university.trim() !== "" && state.location.lat !== null;
  const preferencesValid = state.availabilityMode === "im_free" || state.availabilityStartLocal !== "";
  const interestsValid = state.hobbies.length > 0 && state.freeText.trim() !== "";

  const direction = 1;
  const variants = {
    enter: reduce ? { opacity: 0 } : { opacity: 0, x: 24 },
    center: { opacity: 1, x: 0 },
    exit: reduce ? { opacity: 0 } : { opacity: 0, x: -24 },
  };

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 p-6">
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
              onNext={goNextFromInterests}
              nextDisabled={!interestsValid}
              nextLabel="Extract tags"
            >
              <InterestsStep
                hobbies={state.hobbies}
                freeText={state.freeText}
                onHobbiesChange={(hobbies) => patch({ hobbies })}
                onFreeTextChange={(freeText) => patch({ freeText })}
              />
            </StepShell>
          )}

          {step === 4 && (
            <StepShell
              title="Review your tags"
              onBack={() => setStep(3)}
              onNext={() => {
                patch({ tagsApproved: true });
                setStep(5);
              }}
              nextDisabled={extractLoading}
              nextLabel="Approve & continue"
            >
              <TagReviewStep
                tags={state.extractedTags}
                loading={extractLoading}
                error={extractError}
                onAddTag={(tag) => patch({ extractedTags: dedupe([...state.extractedTags, tag]) })}
                onRemoveTag={(tag) =>
                  patch({ extractedTags: state.extractedTags.filter((t) => t !== tag) })
                }
              />
            </StepShell>
          )}

          {step === 5 && (
            <StepShell
              title="One more thing"
              onBack={() => setStep(4)}
              onNext={finishAndSave}
              nextLoading={saveLoading}
              nextLabel="Finish"
              footerExtra={saveError ? <span className="text-xs text-destructive">{saveError}</span> : undefined}
            >
              <ContextImportStep
                optedIn={state.contextImportOptedIn}
                tags={state.contextImportTags}
                onOptIn={() =>
                  patch({ contextImportOptedIn: true, contextImportTags: [...SIMULATED_IMPORT_TAGS] })
                }
                onOptOut={() => patch({ contextImportOptedIn: false, contextImportTags: [] })}
                onRemoveTag={(tag) =>
                  patch({ contextImportTags: state.contextImportTags.filter((t) => t !== tag) })
                }
              />
            </StepShell>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
