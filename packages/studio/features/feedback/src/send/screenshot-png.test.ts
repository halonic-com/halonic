import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import type { StillImage } from "../overlay/still.ts";
import { maxScreenshotBytes, type PngEncoder, screenshotPng } from "./screenshot-png.ts";

/** A 4K crop: 3840 × 2160 pixels. */
const crop: StillImage = {
  width: 3840,
  height: 2160,
  rgba: new Uint8ClampedArray(0),
};

/** An encoder whose PNG takes `bytesPerPixel` bytes a pixel, like a busy screenshot. */
function encoderAt(bytesPerPixel: number) {
  const sizes: { width: number; height: number }[] = [];
  const encode: PngEncoder = async (_image, size) => {
    sizes.push(size);
    return new Uint8Array(Math.ceil(size.width * size.height * bytesPerPixel));
  };
  return { encode, sizes };
}

verifies("feedback.send-window", () => {
  it("sends a crop that fits at its own size", async () => {
    const { encode, sizes } = encoderAt(0.5);
    const screenshot = await screenshotPng(crop, encode);
    expect(sizes).toEqual([{ width: 3840, height: 2160 }]);
    expect([screenshot.width, screenshot.height]).toEqual([3840, 2160]);
  });

  it("scales a crop over the limit down until it fits, so it is still sent", async () => {
    // 3 bytes a pixel makes the 4K crop about 24 MB, more than three times the limit.
    const { encode, sizes } = encoderAt(3);
    const screenshot = await screenshotPng(crop, encode);
    expect(sizes.length).toBeGreaterThan(1);
    expect(screenshot.png.byteLength).toBeLessThanOrEqual(maxScreenshotBytes);
    expect(screenshot.width).toBeLessThan(3840);
    // The crop keeps its shape: 16 by 9, give or take the rounding.
    expect(Math.abs(screenshot.width / screenshot.height - 16 / 9)).toBeLessThan(0.01);
  });

  it("gives up rather than send a PNG the host would refuse", async () => {
    const tooLarge: PngEncoder = async () => new Uint8Array(maxScreenshotBytes + 1);
    await expect(screenshotPng(crop, tooLarge)).rejects.toThrow("still over");
  });
});
