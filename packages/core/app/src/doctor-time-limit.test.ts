import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { doctorCheckLimitMs, lineOf, timedOut, withinLimit } from "./doctor-time-limit.ts";
import { HandTimers } from "./testing/hand-timers.ts";

verifies("app.doctor-time-limit", () => {
  it("gives what a check found in time, and clears its timer", async () => {
    const timers = new HandTimers();

    await expect(withinLimit(timers, Promise.resolve("found"))).resolves.toBe("found");
    expect(timers.delays()).toEqual([]);
  });

  it("gives up on a check that never answers once the limit is reached", async () => {
    const timers = new HandTimers();
    const found = withinLimit(timers, new Promise<string>(() => undefined));

    expect(timers.delays()).toEqual([doctorCheckLimitMs]);
    timers.fire();
    await expect(found).resolves.toBe(timedOut);
  });

  it("throws what a check throws in time, and drops what it throws after the limit", async () => {
    const timers = new HandTimers();
    let fail: (error: Error) => void = () => undefined;
    const late = withinLimit(
      timers,
      new Promise<string>((_, reject) => {
        fail = reject;
      }),
    );
    timers.fire();
    fail(new Error("too late")); // an unhandled rejection here would fail the test run

    await expect(late).resolves.toBe(timedOut);
    await expect(withinLimit(timers, Promise.reject(new Error("broken")))).rejects.toThrow(
      "broken",
    );
  });

  it("makes the timed-out line in place of the check's own", () => {
    expect(lineOf(timedOut, "disk", () => "own line")).toEqual({
      check: "disk",
      status: "warning",
      timedOut: true,
    });
    expect(lineOf(2, "disk", (found) => found * 2)).toBe(4);
  });
});
