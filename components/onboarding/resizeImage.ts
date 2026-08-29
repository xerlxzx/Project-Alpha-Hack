// Downscales / crops an uploaded photo client-side before it goes into a
// Server Action's FormData body. Next's default Server Action body limit is
// 1MB (node_modules/next/dist/docs/.../serverActions.md) and next.config.ts is
// out of scope for this task, so staying well under that ceiling has to
// happen here. This also keeps uploads fast for the 60-second target.
const JPEG_QUALITY = 0.82;

/** On-screen side length of the square crop viewport, in CSS px. The photo
 *  editor MUST render its viewport at exactly this size for the stored
 *  transform to map correctly onto the output canvas below. */
export const CROP_VIEWPORT = 256;

/** Output avatar is a square this many px per side. */
export const OUTPUT_SIZE = 512;

/** Max user zoom in the crop editor. */
export const MAX_ZOOM = 3;

/** Pan (offset, in viewport px) + zoom the user applied when framing the
 *  photo inside the circular mask. Identity transform = a centered cover. */
export interface PhotoTransform {
  zoom: number;
  offsetX: number;
  offsetY: number;
}

export const IDENTITY_TRANSFORM: PhotoTransform = { zoom: 1, offsetX: 0, offsetY: 0 };

/** Scale at which the smaller image dimension exactly fills the viewport
 *  (object-cover) at zoom 1. */
export function coverBaseScale(width: number, height: number): number {
  return CROP_VIEWPORT / Math.min(width, height);
}

/** Clamp pan so the image always fully covers the circular viewport, so no
 *  empty edges can be dragged into view. */
export function clampTransform(width: number, height: number, t: PhotoTransform): PhotoTransform {
  const scale = coverBaseScale(width, height) * t.zoom;
  const maxX = Math.max(0, (width * scale - CROP_VIEWPORT) / 2);
  const maxY = Math.max(0, (height * scale - CROP_VIEWPORT) / 2);
  return {
    zoom: t.zoom,
    offsetX: Math.min(maxX, Math.max(-maxX, t.offsetX)),
    offsetY: Math.min(maxY, Math.max(-maxY, t.offsetY)),
  };
}

/**
 * Renders the framed crop (pan + zoom) to a square JPEG. Passing
 * IDENTITY_TRANSFORM yields a plain centered cover, equivalent to the old
 * resize-only behaviour.
 */
export async function renderCroppedJpeg(
  file: File,
  transform: PhotoTransform = IDENTITY_TRANSFORM
): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const { width, height } = bitmap;
  const t = clampTransform(width, height, transform);
  const scale = coverBaseScale(width, height) * t.zoom;
  const k = OUTPUT_SIZE / CROP_VIEWPORT;

  const dispW = width * scale;
  const dispH = height * scale;
  const left = (CROP_VIEWPORT - dispW) / 2 + t.offsetX;
  const top = (CROP_VIEWPORT - dispH) / 2 + t.offsetY;

  const canvas = document.createElement("canvas");
  canvas.width = OUTPUT_SIZE;
  canvas.height = OUTPUT_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");
  ctx.drawImage(bitmap, left * k, top * k, dispW * k, dispH * k);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Image encode failed"))),
      "image/jpeg",
      JPEG_QUALITY
    );
  });
}
