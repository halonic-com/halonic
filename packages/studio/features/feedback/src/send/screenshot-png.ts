import type { StillImage } from "../overlay/still.ts";

/**
 * The largest screenshot the window sends, in bytes. The agent host reads at most 10 MiB of
 * JSON and the PNG travels as base64, a third larger, so 7 MiB leaves room for the task's words.
 */
export const maxScreenshotBytes = 7 * 1024 * 1024;

/** How many smaller tries a screenshot gets before the window gives up on it. */
const maxTries = 6;

/** Encodes `image` as a PNG of `size` pixels, scaling it down when `size` is smaller. */
export type PngEncoder = (
  image: StillImage,
  size: { readonly width: number; readonly height: number },
) => Promise<Uint8Array>;

/** A crop as the PNG the task gets, and the size it was sent at. */
export interface ScreenshotPng {
  readonly png: Uint8Array;
  readonly width: number;
  readonly height: number;
}

/**
 * The crop as a PNG of at most `maxBytes`: at its own size when it fits, otherwise scaled down
 * until it does, so a large crop is still sent and never refused for its size.
 *
 * @throws Error when even the smallest try is larger than `maxBytes`
 */
export async function screenshotPng(
  image: StillImage,
  encode: PngEncoder,
  maxBytes = maxScreenshotBytes,
): Promise<ScreenshotPng> {
  let scale = 1;
  for (let tries = 0; tries < maxTries; tries += 1) {
    const width = Math.max(1, Math.floor(image.width * scale));
    const height = Math.max(1, Math.floor(image.height * scale));
    const png = await encode(image, { width, height });
    if (png.byteLength <= maxBytes) return { png, width, height };
    // A PNG's size follows its pixel count, roughly, so the next try aims a tenth below the limit.
    scale *= Math.sqrt(maxBytes / png.byteLength) * 0.9;
  }
  throw new Error(`The screenshot is still over ${maxBytes} bytes after ${maxTries} tries.`);
}

/** The page's own PNG encoder: draws the crop on a canvas, scaled to `size`, and saves it. */
export const canvasPng: PngEncoder = async (image, size) => {
  const full = canvasOf(image.width, image.height);
  full.context.putImageData(new ImageData(new Uint8ClampedArray(image.rgba), image.width), 0, 0);
  const scaled = canvasOf(size.width, size.height);
  scaled.context.imageSmoothingQuality = "high";
  scaled.context.drawImage(full.canvas, 0, 0, size.width, size.height);
  const blob = await new Promise<Blob | null>((resolve) =>
    scaled.canvas.toBlob(resolve, "image/png"),
  );
  if (blob === null) throw new Error("The screenshot couldn't be saved as a PNG.");
  return new Uint8Array(await blob.arrayBuffer());
};

function canvasOf(width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (context === null) throw new Error("The screenshot's canvas has no 2D context.");
  return { canvas, context };
}
