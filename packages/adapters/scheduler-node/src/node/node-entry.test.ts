import { ManualClock, MemoryRecordStore } from "@halonicjs/adapter-memory";
import { describe, expect, it } from "vitest";
import { nodeSchedulerFactory } from "../index.ts";
import { systemSetTimer } from "./index.ts";

describe("the ./node entry", () => {
  it("runs the scheduler over a store with Node's real timer", async () => {
    const clock = new ManualClock("2026-11-09T07:00:00.000Z");
    const delivered: string[] = [];
    const errors: unknown[] = [];
    const scheduler = nodeSchedulerFactory({
      store: new MemoryRecordStore(),
      clock,
      setTimer: systemSetTimer,
      reportError: (error) => errors.push(error),
    })({
      onTimer: async (timer) => {
        delivered.push(`${timer.key}/${timer.timerId}`);
      },
      onTick: async () => {},
    });

    await scheduler.schedule("run_1", "wait", "2026-11-09T08:00:00.000Z");
    clock.advance(60 * 60_000);
    await scheduler.deliverDue();
    await scheduler.close();

    expect(delivered).toEqual(["run_1/wait"]);
    expect(errors).toEqual([]);
  });
});
