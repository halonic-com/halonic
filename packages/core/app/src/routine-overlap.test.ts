import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { applyOverlap, MAX_QUEUED } from "./routine-overlap.ts";

verifies("app.routine-overlap", () => {
  it("starts one waiting time when free, and keeps or drops the rest", () => {
    expect(applyOverlap("skip", false, [1, 2, 3])).toEqual({ start: [1], queue: [], skip: [2, 3] });
    expect(applyOverlap("queue", false, [1, 2, 3])).toEqual({
      start: [1],
      queue: [2, 3],
      skip: [],
    });
    expect(applyOverlap("allow", false, [1, 2, 3])).toEqual({
      start: [1, 2, 3],
      queue: [],
      skip: [],
    });
  });

  it("starts nothing while busy unless overlap is allowed", () => {
    expect(applyOverlap("skip", true, [1, 2])).toEqual({ start: [], queue: [], skip: [1, 2] });
    expect(applyOverlap("queue", true, [1, 2])).toEqual({ start: [], queue: [1, 2], skip: [] });
    expect(applyOverlap("allow", true, [1, 2])).toEqual({ start: [1, 2], queue: [], skip: [] });
  });

  it("queues at most MAX_QUEUED times and skips the newest past it", () => {
    const waiting = Array.from({ length: MAX_QUEUED + 2 }, (_, index) => index);
    const { queue, skip } = applyOverlap("queue", true, waiting);
    expect([queue.length, skip]).toEqual([MAX_QUEUED, [MAX_QUEUED, MAX_QUEUED + 1]]);
  });
});
