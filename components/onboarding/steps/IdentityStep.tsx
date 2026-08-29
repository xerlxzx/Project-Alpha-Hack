"use client";

import * as React from "react";
import { Camera } from "lucide-react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { AGE_RANGES, type AgeRange, type OnboardingState } from "@/components/onboarding/types";
import {
  CROP_VIEWPORT,
  MAX_ZOOM,
  clampTransform,
  coverBaseScale,
  type PhotoTransform,
} from "@/components/onboarding/resizeImage";

export interface IdentityStepProps {
  value: Pick<OnboardingState, "firstName" | "ageRange" | "photoPreviewUrl" | "photoTransform">;
  onChange: (patch: Partial<OnboardingState>) => void;
  onPhotoSelected: (file: File) => void;
  photoError: string | null;
}

/**
 * Circular crop editor: drag to reposition, slider to zoom. The chosen
 * pan/zoom is stored on state.photoTransform and baked into the uploaded
 * JPEG at continue-time (see OnboardingFlow.goNextFromIdentity).
 */
function PhotoCropper({
  src,
  transform,
  onTransform,
}: {
  src: string;
  transform: PhotoTransform;
  onTransform: (t: PhotoTransform) => void;
}) {
  const [dims, setDims] = React.useState<{ w: number; h: number } | null>(null);
  const dragStart = React.useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  const scale = dims ? coverBaseScale(dims.w, dims.h) * transform.zoom : 1;
  const dispW = dims ? dims.w * scale : CROP_VIEWPORT;
  const dispH = dims ? dims.h * scale : CROP_VIEWPORT;
  const left = (CROP_VIEWPORT - dispW) / 2 + transform.offsetX;
  const top = (CROP_VIEWPORT - dispH) / 2 + transform.offsetY;

  function onPointerDown(e: React.PointerEvent) {
    if (!dims) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragStart.current = { x: e.clientX, y: e.clientY, ox: transform.offsetX, oy: transform.offsetY };
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!dragStart.current || !dims) return;
    const next = clampTransform(dims.w, dims.h, {
      zoom: transform.zoom,
      offsetX: dragStart.current.ox + (e.clientX - dragStart.current.x),
      offsetY: dragStart.current.oy + (e.clientY - dragStart.current.y),
    });
    onTransform(next);
  }

  function endDrag() {
    dragStart.current = null;
  }

  function onZoom(zoom: number) {
    if (!dims) return;
    onTransform(clampTransform(dims.w, dims.h, { ...transform, zoom }));
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <div
        className="relative touch-none overflow-hidden rounded-full border border-border bg-muted"
        style={{ width: CROP_VIEWPORT, height: CROP_VIEWPORT, cursor: dims ? "grab" : "default" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        role="group"
        aria-label="Drag to reposition your photo"
      >
        {/* Native <img> so we can read natural dimensions and freely position it. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt="Frame your profile photo"
          draggable={false}
          onLoad={(e) => {
            const img = e.currentTarget;
            setDims({ w: img.naturalWidth, h: img.naturalHeight });
          }}
          className="pointer-events-none absolute max-w-none select-none"
          style={{ width: dispW, height: dispH, left, top }}
        />
        <div className="pointer-events-none absolute inset-0 rounded-full ring-1 ring-inset ring-white/10" />
      </div>

      <div className="flex w-full max-w-[16rem] items-center gap-3">
        <Camera className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <input
          type="range"
          min={1}
          max={MAX_ZOOM}
          step={0.01}
          value={transform.zoom}
          onChange={(e) => onZoom(Number(e.target.value))}
          aria-label="Zoom"
          className="h-8 w-full cursor-pointer accent-[var(--accent)]"
        />
      </div>
    </div>
  );
}

export function IdentityStep({ value, onChange, onPhotoSelected, photoError }: IdentityStepProps) {
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  return (
    <>
      <div className="flex flex-col items-center gap-4">
        {value.photoPreviewUrl ? (
          <PhotoCropper
            src={value.photoPreviewUrl}
            transform={value.photoTransform}
            onTransform={(photoTransform) => onChange({ photoTransform })}
          />
        ) : (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="group relative flex size-28 items-center justify-center overflow-hidden rounded-full border-2 border-dashed border-border bg-muted text-muted-foreground transition-colors hover:border-[var(--accent)]"
            aria-label="Upload profile photo"
          >
            <Camera className="size-7" />
          </button>
        )}
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
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="min-h-11 py-1 text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground"
        >
          {value.photoPreviewUrl ? "Change photo" : "Add a profile photo (optional)"}
        </button>
        {value.photoPreviewUrl && (
          <span className="-mt-2 text-xs text-muted-foreground">Drag to reposition · slide to zoom</span>
        )}
        {photoError && <span className="text-sm text-destructive">{photoError}</span>}
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="firstName" className="text-base font-medium">
          First name
        </label>
        <Input
          id="firstName"
          autoFocus
          value={value.firstName}
          onChange={(e) => onChange({ firstName: e.target.value })}
          placeholder="Alex"
          className="rounded-full px-5"
        />
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-base font-medium">Age range</span>
        <div className="flex flex-wrap gap-3">
          {AGE_RANGES.map((range) => (
            <button
              key={range}
              type="button"
              onClick={() => onChange({ ageRange: range as AgeRange })}
              className={cn(
                "min-h-12 rounded-full border px-5 py-3 text-base transition-colors",
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
