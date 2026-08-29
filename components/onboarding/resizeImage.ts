// Downscales an uploaded photo client-side before it goes into a Server
// Action's FormData body. Next's default Server Action body limit is 1MB
// (node_modules/next/dist/docs/.../serverActions.md) and next.config.ts is
// out of scope for this task, so staying well under that ceiling has to
// happen here. This also keeps uploads fast for the 60-second target.
const MAX_DIMENSION = 512;
const JPEG_QUALITY = 0.82;

export async function resizeImageToJpeg(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");
  ctx.drawImage(bitmap, 0, 0, width, height);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Image encode failed"))),
      "image/jpeg",
      JPEG_QUALITY
    );
  });
}
