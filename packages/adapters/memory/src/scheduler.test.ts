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

  it("lists timers set for the same time by timer id", async () => {
    const clock = new ManualClock();
    const scheduler = new MemoryScheduler(recorder().listener, clock);
    const at = clock.now().toISOString();
    for (const timerId of ["c", "a", "b"]) await scheduler.schedule("run_1", timerId, at);
    const pending = await scheduler.pending("run_1");
    expect(pending.map((timer) => timer.timerId)).toEqual(["a", "b", "c"]);
  });

  it("delivers the timers due in one call earliest first", async () => {
    const clock = new ManualClock();
    const { timers, listener } = recorder();
    const scheduler = new MemoryScheduler(listener, clock);
    const inMs = (ms: number) => new Date(clock.now().getTime() + ms).toISOString();
    await scheduler.schedule("run_1", "late", inMs(2_000));
    await scheduler.schedule("run_1", "early", inMs(1_000));
    clock.advance(2_000);
    await scheduler.runDue();
    expect(timers.map((timer) => timer.timerId)).toEqual(["early", "late"]);
  });

  it("skips a due timer that an earlier delivery in the same call cancelled or set again", async () => {
    const clock = new ManualClock();
    const delivered: string[] = [];
    const scheduler: MemoryScheduler = new MemoryScheduler(
      {
        onTimer: async (timer) => {
          delivered.push(timer.timerId);
          if (timer.timerId !== "first") return;
          await scheduler.cancel("run_1", "cancelled");
          await scheduler.schedule("run_1", "moved", later);
        },
        onTick: async () => {},
      },
      clock,
    );
    const now = clock.now().toISOString();
    const later = new Date(clock.now().getTime() + 60_000).toISOString();
    await scheduler.schedule("run_1", "first", now);
    await scheduler.schedule("run_1", "cancelled", now);
    await scheduler.schedule("run_1", "moved", now);
    await scheduler.runDue();
    expect(delivered).toEqual(["first"]);
    expect(await scheduler.pending("run_1")).toEqual([
      { key: "run_1", timerId: "moved", at: later },
    ]);
  });

  it("drops a timer whose duplicate delivery rejects, and goes on", async () => {
    const clock = new ManualClock();
    let calls = 0;
    const scheduler = new MemoryScheduler(
      {
        onTimer: async () => {
          calls += 1;
          if (calls === 2) throw new Error("already handled");
        },
        onTick: async () => {},
      },
      clock,
      { duplicateDeliveries: true },
    );
    await scheduler.schedule("run_1", "wait", clock.now().toISOString());
    await scheduler.runDue();
    expect(calls).toBe(2);
    expect(await scheduler.pending("run_1")).toEqual([]);
  });
});
