import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { overlayScreen, releasedArea } from "./drag.ts";
import { readStill } from "./still.ts";

function answer(width: number, height: number, pixels: number): Uint8Array {
  const bytes = new Uint8Array(8 + pixels * 4);
  const header = new DataView(bytes.buffer);
  header.setUint32(0, width, true);
  header.setUint32(4, height, true);
  return bytes;
}

verifies("feedback.overlay", () => {
  it("reads the still's size, then its rows, and refuses a torn one", () => {
    const still = readStill(answer(3, 2, 6).buffer);
    expect([still.width, still.height, still.rgba.length]).toEqual([3, 2, 24]);
    expect(readStill(answer(3, 2, 6)).width).toBe(3);
    expect(() => readStill(answer(3, 2, 5))).toThrow("aren't 3 × 2 pixels");
    expect(() => readStill(new Uint8Array(4))).toThrow("no size");
    expect(() => readStill("gone")).toThrow("isn't bytes");
  });

  it("scales a box by the still's pixels per CSS pixel, and keeps none under 8 × 8", () => {
    const still = readStill(answer(300, 150, 300 * 150).buffer);
    const screen = overlayScreen(still, { width: 200, height: 100 });
    expect(releasedArea(screen, { x: 10, y: 20, width: 8, height: 8 })).toEqual({
      left: 15,
      top: 30,
      width: 12,
      height: 12,
    });
    expect(releasedArea(screen, { x: 10, y: 20, width: 7, height: 50 })).toBeUndefined();
  });
});
