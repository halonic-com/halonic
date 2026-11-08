import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { AssertionError } from "./assert.ts";
import { fixedClock, systemClock } from "./clock.ts";

verifies("std.clock", () => {
  it("starts a default fixed clock at 2026-01-01 and moves on by one second", () => {
    const clock = fixedClock();
    expect(clock.now().toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(clock.now().toISOString()).toBe("2026-01-01T00:00:01.000Z");
  });

  it("uses the given start and step", () => {
    const clock = fixedClock(0, 250);
    expect([clock.now(), clock.now(), clock.now()].map((time) => time.getTime())).toEqual([
      0, 250, 500,
    ]);
  });

  it("allows a step of zero", () => {
    const clock = fixedClock(5, 0);
    expect(clock.now().getTime()).toBe(5);
    expect(clock.now().getTime()).toBe(5);
  });

  it("gives every fixed clock its own position", () => {
    const first = fixedClock(0, 10);
    const second = fixedClock(0, 10);
    first.now();
    first.now();
    expect(second.now().getTime()).toBe(0);
  });

  it("refuses a negative step or a start that isn't a number", () => {
    expect(() => fixedClock(0, -1)).toThrow(AssertionError);
    expect(() => fixedClock(0, -1)).toThrow(/step/);
    expect(() => fixedClock(Number.NaN)).toThrow(/start/);
  });

  it("tells the machine's time with the system clock", () => {
    const before = Date.now();
    const now = systemClock.now().getTime();
    const after = Date.now();
    expect(now).toBeGreaterThanOrEqual(before);
    expect(now).toBeLessThanOrEqual(after);
  });
});
