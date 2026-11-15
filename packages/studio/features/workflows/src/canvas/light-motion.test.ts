import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { lightCurve, lightHopDuration, lightPoint, lightProgress } from "./light-motion.ts";

verifies("workflows.canvas.point-of-light", () => {
  it("bows up by 18 % of the distance on a left-to-right hop", () => {
    const curve = lightCurve({ x: 0, y: 0 }, { x: 100, y: 0 });
    expect(curve.control.x).toBeCloseTo(50);
    expect(curve.control.y).toBeCloseTo(-36);
    expect(lightPoint(curve, 0.5).y).toBeCloseTo(-18);
  });

  it("bows to the right on a top-to-bottom hop", () => {
    const curve = lightCurve({ x: 0, y: 0 }, { x: 0, y: 100 });
    expect(curve.control.x).toBeCloseTo(36);
    expect(curve.control.y).toBeCloseTo(50);
  });

  it("takes 500 ms plus 2.5 ms a pixel, between 700 and 1100 ms", () => {
    expect(lightHopDuration(120)).toBe(800);
    expect(lightHopDuration(20)).toBe(700);
    expect(lightHopDuration(300)).toBe(1100);
  });

  it("starts at rest, goes about 4 % past the end, and ends exactly on it", () => {
    const duration = 1000;
    expect(lightProgress(0, duration)).toBe(0);
    expect(lightProgress(5, duration)).toBeLessThan(0.01);
    let peak = 0;
    for (let ms = 0; ms <= duration; ms += 1) peak = Math.max(peak, lightProgress(ms, duration));
    expect(peak).toBeGreaterThan(1.035);
    expect(peak).toBeLessThan(1.045);
    expect(lightProgress(duration, duration)).toBe(1);
    expect(Math.abs(lightProgress(duration - 1, duration) - 1)).toBeLessThan(0.01);
    const curve = lightCurve({ x: 10, y: 20 }, { x: 310, y: 20 });
    expect(lightPoint(curve, 1)).toEqual({ x: 310, y: 20 });
  });
});
