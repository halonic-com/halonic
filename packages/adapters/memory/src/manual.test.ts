import { describe, expect, it } from "vitest";
import { ManualClock } from "./clock.ts";
import { SequentialIds } from "./ids.ts";
import { MemorySecrets } from "./secrets.ts";

describe("ManualClock (adapter-memory.manual-clock)", () => {
  it("starts at 2026-01-01 and stands still until it is moved", () => {
    const clock = new ManualClock();
    expect(clock.now().toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(clock.now().toISOString()).toBe("2026-01-01T00:00:00.000Z");
    clock.advance(1500);
    expect(clock.now().toISOString()).toBe("2026-01-01T00:00:01.500Z");
  });

  it("can be set to any time, also an earlier one", () => {
    const clock = new ManualClock("2026-05-01T12:00:00.000Z");
    clock.set("2026-04-30T00:00:00.000Z");
    expect(clock.now().toISOString()).toBe("2026-04-30T00:00:00.000Z");
  });

  it("refuses a time that isn't one, and a step back through advance", () => {
    expect(() => new ManualClock("soon")).toThrow(RangeError);
    const clock = new ManualClock();
    expect(() => clock.set("later")).toThrow(RangeError);
    expect(() => clock.advance(-1)).toThrow(RangeError);
    expect(() => clock.advance(Number.NaN)).toThrow(RangeError);
    expect(clock.now().toISOString()).toBe("2026-01-01T00:00:00.000Z");
  });
});

describe("MemorySecrets and SequentialIds (adapter-memory.secrets, adapter-memory.ids)", () => {
  it("refuses a configured secret with a bad name", () => {
    expect(() => new MemorySecrets({ "bad name": "x" })).toThrow(RangeError);
  });

  it("counts each prefix on its own from 1", () => {
    const ids = new SequentialIds();
    expect([ids.next("run"), ids.next("run"), ids.next("event")]).toEqual([
      "run_1",
      "run_2",
      "event_1",
    ]);
  });
});
