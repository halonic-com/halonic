import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { advance, goalOf, headTo, LIGHT_REST_EASE_MS, restOn, restPose } from "./light-flight.ts";

const A = { x: 0, y: 0 };
const B = { x: 120, y: 0 };
const C = { x: 240, y: 0 };
const D = { x: 240, y: 120 };

verifies("workflows.canvas.point-of-light-rest", () => {
  it("floats at most 2 px and breathes between 85 % and 130 %", () => {
    let low = 9;
    let high = 0;
    for (let ms = LIGHT_REST_EASE_MS; ms <= 14_400 + LIGHT_REST_EASE_MS; ms += 50) {
      const pose = restPose(ms);
      expect(Math.hypot(pose.offset.x, pose.offset.y)).toBeCloseTo(2);
      low = Math.min(low, pose.brightness);
      high = Math.max(high, pose.brightness);
    }
    expect(low).toBeCloseTo(0.85, 2);
    expect(high).toBeCloseTo(1.3, 2);
    expect(restPose(7000).offset.x).toBeCloseTo(2);
  });

  it("eases the float and the breath in after landing, with no jump", () => {
    const first = restPose(0);
    expect(first.offset).toEqual({ x: 0, y: 0 });
    expect(first.brightness).toBe(1);
    let last = first;
    for (let ms = 1; ms <= LIGHT_REST_EASE_MS; ms += 1) {
      const pose = restPose(ms);
      expect(Math.hypot(pose.offset.x - last.offset.x, pose.offset.y - last.offset.y)).toBeLessThan(
        0.02,
      );
      expect(Math.abs(pose.brightness - last.brightness)).toBeLessThan(0.005);
      expect(pose.brightness).toBeLessThanOrEqual(1);
      last = pose;
    }
  });

  it("lifts off at once from rest and lands exactly on the dot", () => {
    const flight = headTo(restOn(A), B, 1000);
    expect(flight.kind).toBe("hop");
    expect(advance(flight, 1000).position).toEqual(A);
    const landed = advance(flight, 1000 + 800);
    expect(landed.flight).toEqual(restOn(B));
    expect(landed.position).toEqual(B);
  });

  it("stays at rest when sent where it already is", () => {
    const flight = restOn(A);
    expect(headTo(flight, A, 0)).toBe(flight);
  });

  it("finishes a hop and then flies once to the newest step", () => {
    let flight = headTo(restOn(A), B, 0);
    flight = headTo(flight, C, 100);
    flight = headTo(flight, D, 200);
    expect(goalOf(flight)).toEqual(D);
    // The first hop (120 px) takes 800 ms; the light is on B at that moment, not on C.
    const atB = advance(flight, 800);
    expect(atB.flight.kind).toBe("hop");
    expect(atB.position).toEqual(B);
    if (atB.flight.kind === "hop") expect(atB.flight.curve.to).toEqual(D);
    const done = advance(flight, 800 + 5000);
    expect(done.flight).toEqual(restOn(D));
  });

  it("drops a waiting step when the hop's own target is the newest again", () => {
    let flight = headTo(restOn(A), B, 0);
    flight = headTo(flight, C, 100);
    flight = headTo(flight, B, 200);
    expect(advance(flight, 5000).flight).toEqual(restOn(B));
  });
});
