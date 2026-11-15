import { ManualClock, MemoryRecordStore } from "@halonicjs/adapter-memory";
import { describe, expect, it } from "vitest";
import { nodeSchedulerFactory } from "../index.ts";
import { systemSetTimer } from "./index.ts";

describe("the ./node subpath", () => {
  it("wakes a scheduler built on a plain record store with the real timer", async () => {
    const clock = new ManualClock("2026-11-09T07:00:00.000Z");
    const delivered: string[] = [];
    const scheduler = nodeSchedulerFactory({
      store: new MemoryRecordStore(),
      clock,
      setTimer: systemSetTimer,
      reportError: (error) => {
        throw error;
      },
    })({
      onTimer: async (timer) => {
        delivered.push(timer.timerId);
      },
      onTick: async () => {},
    });
    await scheduler.schedule("run_1", "wait", "2026-11-09T07:00:00.000Z");
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(delivered).toEqual(["wait"]);
    await scheduler.close();
  });
});
