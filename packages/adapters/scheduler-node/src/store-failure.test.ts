import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { fail, startScheduler } from "./harness.test-helper.ts";

const second = 1000;

type Started = ReturnType<typeof startScheduler>;

/**
 * Moves the clock, fires the wake-ups that are due and lets what they started
 * run as far as it can. It never calls deliverDue: that would hide a wake-up
 * set with delay 0.
 */
async function fireWakeUpsAfter(s: Started, ms: number): Promise<void> {
  s.clock.advance(ms);
  s.timers.fireDue();
  // The store is in memory, so one turn of the event loop settles every step.
  await new Promise<void>((resolve) => setImmediate(resolve));
}

const storeDown = new Error("the record store is unavailable");

verifies("scheduler-node.store-failure", () => {
  it("waits 1 second, then 2, when the store fails to remove a delivered timer, then removes it", async () => {
    const s = startScheduler();
    const at = s.inMs(second);
    await s.scheduler.schedule("run_1", "wait", at);
    s.store.failAppends = true;

    await fireWakeUpsAfter(s, second);
    expect(s.listener.timers).toHaveLength(1);
    expect(s.errors).toEqual([{ error: storeDown, source: { key: "run_1", timerId: "wait", at } }]);
    expect(s.timers.delays.at(-1)).toBe(second);

    await fireWakeUpsAfter(s, second);
    expect(s.listener.timers).toHaveLength(2);
    expect(s.timers.delays.at(-1)).toBe(2 * second);

    s.store.failAppends = false;
    await fireWakeUpsAfter(s, 2 * second);
    expect(s.listener.timers).toHaveLength(3);
    expect(await s.scheduler.pending("run_1")).toEqual([]);
    await s.scheduler.close();
  });

  it("waits 1 second when the store fails to record the retry of a rejected timer", async () => {
    const s = startScheduler();
    s.listener.onTimerBehaviour = fail;
    const at = s.inMs(second);
    await s.scheduler.schedule("run_1", "wait", at);
    s.store.failAppends = true;

    await fireWakeUpsAfter(s, second);
    expect(s.listener.timers).toHaveLength(1);
    expect(s.errors.map((reported) => reported.error)).toEqual([
      new Error("listener failed"),
      storeDown,
    ]);
    expect(s.timers.delays.at(-1)).toBe(second);
    await s.scheduler.close();
  });
});
