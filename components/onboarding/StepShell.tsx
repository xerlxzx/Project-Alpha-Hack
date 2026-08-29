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

/**
 * Flat premium surface for form steps — GlassPanel is reserved for chrome/
 * hero surfaces only (see GlassPanel.tsx docstring), so onboarding cards use
 * the plain `bg-card` surface instead. One dominant amber action (PrimaryCTA)
 * per step, per DESIGN_DIRECTION.md.
 */
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
    <div className="flex flex-col gap-6 rounded-2xl bg-card p-6 text-card-foreground ring-1 ring-foreground/10">
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-xl font-semibold">{title}</h1>
        {description && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
      </div>

      <div className="flex flex-col gap-4">{children}</div>

      <div className="flex flex-col gap-3">
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
            <Button type="button" variant="ghost" size="sm" onClick={onBack}>
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
