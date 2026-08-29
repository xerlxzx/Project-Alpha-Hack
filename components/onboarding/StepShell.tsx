"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { PrimaryCTA } from "@/components/motion/PrimaryCTA";

export interface StepShellProps {
  title: string;
  description?: string;
  children: React.ReactNode;
  onBack?: () => void;
  onNext: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
  nextLoading?: boolean;
  footerExtra?: React.ReactNode;
}

/** Wrapper for onboarding form steps. One PrimaryCTA action per step. */
export function StepShell({
  title,
  description,
  children,
  onBack,
  onNext,
  nextLabel = "Continue",
  nextDisabled,
  nextLoading,
  footerExtra,
}: StepShellProps) {
  return (
    <div className="flex flex-col gap-7 rounded-2xl bg-black p-7 text-card-foreground ring-1 ring-white/[0.08] shadow-[inset_0_1px_0_rgba(255,255,255,0.07),inset_0_-1px_0_rgba(255,255,255,0.02),0_2px_6px_rgba(0,0,0,0.55),0_14px_32px_-24px_rgba(255,255,255,0.08)]">
      <div className="flex flex-col gap-1.5">
        <h1 className="font-heading text-2xl font-semibold">{title}</h1>
        {description && (
          <p className="text-base text-muted-foreground">{description}</p>
        )}
      </div>

      <div className="flex flex-col gap-5">{children}</div>

      <div className="flex flex-col gap-4">
        <PrimaryCTA
          type="button"
          onClick={onNext}
          disabled={nextDisabled || nextLoading}
          className="w-full disabled:pointer-events-none disabled:opacity-50"
        >
          {nextLoading ? "Please wait…" : nextLabel}
        </PrimaryCTA>
        <div className="flex items-center justify-between">
          {onBack ? (
            <Button type="button" variant="ghost" onClick={onBack} className="h-11 rounded-full px-5 text-base">
              Back
            </Button>
          ) : (
            <span />
          )}
          {footerExtra}
        </div>
      </div>
    </div>
  );
}
