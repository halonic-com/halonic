import { verifies } from "@halonicjs/testing-spec";
import { expect, it, vi } from "vitest";
import { startScheduler } from "./harness.test-helper.ts";

const second = 1000;
const minute = 60 * second;

type Started = ReturnType<typeof startScheduler>;

/**
 * Moves the clock and fires the due wake-ups, whose clock fails: `fireDue`
 * has read the time by then, and the wake-up reads it after a microtask.
 * Nothing calls `deliverDue`, so the failure stays the wake-up's.
 */
async function failedWakeUpAfter(s: Started, ms: number): Promise<void> {
  const failures = s.errors.length;
  s.clock.advance(ms);
  s.timers.fireDue();
  s.clock.failNextNow = true;
  await vi.waitFor(() => expect(s.errors).toHaveLength(failures + 1));
}

async function wakeUpAfter(s: Started, ms: number): Promise<void> {
  const wokeUp = s.wokeUp.count;
  s.clock.advance(ms);
  s.timers.fireDue();
  await vi.waitFor(() => expect(s.wokeUp.count).toBe(wokeUp + 1));
}

verifies("scheduler-node.wake-up-failure", () => {
  it("reports a failed wake-up and wakes again 1 second later, then 2, and delivers what was due", async () => {
    const s = startScheduler();
    const at = s.inMs(minute);
    await s.scheduler.schedule("run_1", "wait", at);

    await failedWakeUpAfter(s, minute);
    expect(s.errors.at(-1)).toEqual({ error: new Error("the clock failed"), source: "wake-up" });
    expect(s.timers.delays.at(-1)).toBe(second);
    await failedWakeUpAfter(s, second);
    expect(s.timers.delays.at(-1)).toBe(2 * second);
    expect(s.listener.timers).toEqual([]);

    await wakeUpAfter(s, 2 * second);
    expect(s.listener.timers).toEqual([{ key: "run_1", timerId: "wait", at }]);
    expect(s.listener.ticks).toHaveLength(1);
  });

  it("calls onWokeUp after each wake-up that worked, and waits 1 second again after the next failure", async () => {
    const s = startScheduler();
    await s.scheduler.pending("run_1");
    await failedWakeUpAfter(s, minute);
    await failedWakeUpAfter(s, second);

    await wakeUpAfter(s, 2 * second);
    expect(s.wokeUp.count).toBe(1);

    await failedWakeUpAfter(s, minute);
    expect(s.timers.delays.at(-1)).toBe(second);
  });

  it("calls no onWokeUp for a wake-up that failed", async () => {
    const s = startScheduler();
    await s.scheduler.pending("run_1");
    await failedWakeUpAfter(s, minute);
    expect(s.wokeUp.count).toBe(0);
    expect(s.timers.pendingCount).toBe(1);
  });
});
