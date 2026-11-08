import type { ScheduledTimer } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { ManualClock } from "./clock.ts";
import { MemoryScheduler, memorySchedulerFactory } from "./scheduler.ts";

function recorder() {
  const timers: ScheduledTimer[] = [];
  return {
    timers,
    listener: {
      onTimer: async (timer: ScheduledTimer) => {
        timers.push(timer);
      },
      onTick: async () => {},
    },
  };
}

verifies("memory.scheduler", () => {
  it("delivers nothing until runDue is called", async () => {
    const clock = new ManualClock();
    const { timers, listener } = recorder();
    const scheduler = memorySchedulerFactory(clock)(listener) as MemoryScheduler;
    await scheduler.schedule("run_1", "wait", clock.now().toISOString());
    clock.advance(60_000);
    expect(timers).toEqual([]);
    await scheduler.runDue();
    expect(timers).toHaveLength(1);
  });

  it("delivers a timer exactly once by default, however often runDue is called", async () => {
    const clock = new ManualClock();
    const { timers, listener } = recorder();
    const scheduler = new MemoryScheduler(listener, clock);
    const at = clock.now().toISOString();
    await scheduler.schedule("run_1", "wait", at);
    await scheduler.runDue();
    clock.advance(15 * 60_000);
    await scheduler.runDue();
    expect(timers).toEqual([{ key: "run_1", timerId: "wait", at }]);
  });

  it("delivers every timer twice when asked to, as a real platform may", async () => {
    const clock = new ManualClock();
    const { timers, listener } = recorder();
    const scheduler = new MemoryScheduler(listener, clock, { duplicateDeliveries: true });
    const at = clock.now().toISOString();
    await scheduler.schedule("run_1", "wait", at);
    await scheduler.runDue();
    await scheduler.runDue();
    expect(timers).toEqual([
      { key: "run_1", timerId: "wait", at },
      { key: "run_1", timerId: "wait", at },
    ]);
    expect(await scheduler.pending("run_1")).toEqual([]);
  });

  it("refuses a time that isn't one", async () => {
    const scheduler = new MemoryScheduler(recorder().listener, new ManualClock());
    await expect(scheduler.schedule("run_1", "wait", "soon")).rejects.toThrow(RangeError);
  });

  it("keeps a key and timer id that contain the separator apart", async () => {
    const clock = new ManualClock();
    const scheduler = new MemoryScheduler(recorder().listener, clock);
    const at = clock.now().toISOString();
    await scheduler.schedule("a", "b/c", at);
    await scheduler.schedule("a/b", "c", at);
    expect(await scheduler.pending("a")).toEqual([{ key: "a", timerId: "b/c", at }]);
  });
});
