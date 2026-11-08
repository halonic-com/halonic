import { describe, expect, it } from "vitest";
import { AssertionError } from "./assert.ts";
import { fixedClock } from "./clock.ts";
import { fixedIds, randomIds } from "./ids.ts";

describe("std.ids", () => {
  it("builds a random id from the prefix, the time in base 36 and the random bytes in hex", () => {
    const ids = randomIds(
      () => new Uint8Array([0xde, 0xad, 0xbe, 0xef]),
      fixedClock(1_700_000_000_000),
    );
    expect(ids.next("run")).toBe("run_loyw3v28_deadbeef");
  });

  it("asks the random source for 4 bytes per id", () => {
    const requested: number[] = [];
    const ids = randomIds((count) => {
      requested.push(count);
      return new Uint8Array(count);
    }, fixedClock());
    ids.next("a");
    ids.next("b");
    expect(requested).toEqual([4, 4]);
  });

  it("refuses a random source that returns the wrong number of bytes", () => {
    const ids = randomIds(() => new Uint8Array(3), fixedClock());
    expect(() => ids.next("run")).toThrow(AssertionError);
    expect(() => ids.next("run")).toThrow(/4 random bytes but got 3/);
  });

  it("sorts ids made later after ids made earlier", () => {
    const ids = randomIds((count) => new Uint8Array(count).fill(0xff), fixedClock(0, 1));
    const later = randomIds((count) => new Uint8Array(count), fixedClock(1_000_000_000_000));
    const first = ids.next("run");
    const second = ids.next("run");
    expect(first < second).toBe(true);
    expect(later.next("run") > second).toBe(true);
  });

  it("counts fixed ids per prefix from 1", () => {
    const ids = fixedIds();
    expect([ids.next("run"), ids.next("run"), ids.next("event")]).toEqual([
      "run_1",
      "run_2",
      "event_1",
    ]);
  });

  it("gives every fixed generator its own counters", () => {
    const first = fixedIds();
    first.next("run");
    expect(fixedIds().next("run")).toBe("run_1");
  });
});
