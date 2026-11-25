import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import {
  deviceCrop,
  isSelection,
  type Screen,
  screenAt,
  selectionBox,
  sizeLabel,
  sizeLabelPlacement,
  stillSize,
} from "./crop.ts";

/** A laptop's Retina screen on the left and a plain monitor to its right. */
const retina: Screen = {
  id: "built-in",
  bounds: { x: 0, y: 0, width: 1440, height: 900 },
  scaleFactor: 2,
};
const monitor: Screen = {
  id: "monitor",
  bounds: { x: 1440, y: 0, width: 1920, height: 1080 },
  scaleFactor: 1,
};

verifies("feedback.crop", () => {
  it("crops in device pixels and labels that size", () => {
    const box = selectionBox(retina, { x: 100, y: 50 }, { x: 740, y: 380 });

    expect(box).toEqual({ x: 100, y: 50, width: 640, height: 330 });
    const crop = deviceCrop(retina, box);
    expect(crop).toEqual({ x: 200, y: 100, width: 1280, height: 660 });
    expect(sizeLabel(crop)).toBe("1280 × 660");
  });

  it("draws the same box whichever way the drag goes", () => {
    expect(selectionBox(retina, { x: 740, y: 380 }, { x: 100, y: 50 })).toEqual({
      x: 100,
      y: 50,
      width: 640,
      height: 330,
    });
  });

  it("keeps the box on the screen where the drag started", () => {
    const start = { x: 1400, y: 200 };

    expect(screenAt([retina, monitor], start)).toBe(retina);
    expect(selectionBox(retina, start, { x: 1800, y: 950 })).toEqual({
      x: 1400,
      y: 200,
      width: 40,
      height: 700,
    });
  });

  it("finds the screen right of the first one, and none outside the desktop", () => {
    expect(screenAt([retina, monitor], { x: 1440, y: 10 })).toBe(monitor);
    expect(screenAt([retina, monitor], { x: 1500, y: 1000 })).toBe(monitor);
    expect(screenAt([retina, monitor], { x: 100, y: 950 })).toBeUndefined();
  });

  it("treats a click or a box under 8 × 8 as no selection", () => {
    expect(isSelection(selectionBox(monitor, { x: 1500, y: 10 }, { x: 1500, y: 10 }))).toBe(false);
    expect(isSelection({ x: 0, y: 0, width: 5, height: 40 })).toBe(false);
    expect(isSelection({ x: 0, y: 0, width: 40, height: 7.5 })).toBe(false);
    expect(isSelection({ x: 0, y: 0, width: 8, height: 8 })).toBe(true);
  });

  it("crops on a screen right of the first, from that screen's own still", () => {
    const box = selectionBox(monitor, { x: 1500, y: 20 }, { x: 1600, y: 70 });

    expect(deviceCrop(monitor, box)).toEqual({ x: 60, y: 20, width: 100, height: 50 });
  });

  it("rounds a fractional box outwards and stays inside the still", () => {
    const scaled: Screen = {
      id: "scaled",
      bounds: { x: 0, y: 0, width: 1280, height: 720 },
      scaleFactor: 1.5,
    };

    expect(stillSize(scaled)).toEqual({ width: 1920, height: 1080 });
    expect(deviceCrop(scaled, { x: 10.3, y: 0, width: 20, height: 10 })).toEqual({
      x: 15,
      y: 0,
      width: 31,
      height: 15,
    });
    expect(deviceCrop(scaled, { x: 1270, y: 715, width: 10, height: 5 })).toEqual({
      x: 1905,
      y: 1072,
      width: 15,
      height: 8,
    });
  });

  it("puts the size label below the box, and inside it near the screen's edge", () => {
    const label = { width: 90, height: 24 };

    expect(sizeLabelPlacement(retina, { x: 100, y: 50, width: 640, height: 330 }, label)).toBe(
      "below",
    );
    expect(sizeLabelPlacement(retina, { x: 100, y: 600, width: 640, height: 290 }, label)).toBe(
      "inside",
    );
    expect(sizeLabelPlacement(retina, { x: 0, y: 50, width: 40, height: 40 }, label)).toBe(
      "inside",
    );
  });
});
