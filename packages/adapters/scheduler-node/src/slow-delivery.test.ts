import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { startScheduler } from "./harness.test-helper.ts";

const second = 1000;
const minute = 60 * second;

type Started = ReturnType<typeof startScheduler>;

/**
 * Moves the clock, fires the wake-ups that are due and lets what they started
 * run as far as it can. It never calls deliverDue: that would deliver what a
 * missing wake-up should have, and hide it.
 */
async function fireWakeUpsAfter(s: Started, ms: number): Promise<void> {
  s.clock.advance(ms);
  s.timers.fireDue();
  // The store is in memory, so one turn of the event loop settles every step.
  await new Promise<void>((resolve) => setImmediate(resolve));
}

/** Makes the listener hold on to the timer `timerId` until the test calls `release`. */
function holdTimer(s: Started, timerId: string): { release: () => void } {
  const held = { release: () => {} };
  s.listener.onTimerBehaviour = (timer) =>
    timer.timerId === timerId
      ? new Promise<void>((resolve) => {
          held.release = resolve;
        })
      : Promise.resolve();
  return held;
}

/** Makes every tick hold on until the test calls `release`. */
function holdTicks(s: Started): { release: () => void } {
  const held = { release: () => {} };
  s.listener.onTickBehaviour = () =>
    new Promise<void>((resolve) => {
      held.release = resolve;
    });
  return held;
}

verifies("scheduler-node.slow-delivery", () => {
  describe("while a delivery is still running", () => {
    it("delivers the next timer on time", async () => {
      const s = startScheduler();
      const slow = holdTimer(s, "slow");
      await s.scheduler.schedule("run_1", "slow", s.inMs(second));
      const nextAt = s.inMs(5 * second);
      await s.scheduler.schedule("run_2", "next", nextAt);

      await fireWakeUpsAfter(s, second);
      expect(s.listener.timers.map((timer) => timer.timerId)).toEqual(["slow"]);

      await fireWakeUpsAfter(s, 4 * second);
      expect(s.listener.timers.at(-1)).toEqual({ key: "run_2", timerId: "next", at: nextAt });

      slow.release();
      await s.scheduler.close();
    });

    it("retries a failed timer on time", async () => {
      const s = startScheduler();
      const slow = holdTimer(s, "slow");
      const holdSlow = s.listener.onTimerBehaviour;
      let failuresLeft = 1;
      s.listener.onTimerBehaviour = async (timer) => {
        if (timer.timerId === "flaky" && failuresLeft > 0) {
          failuresLeft -= 1;
          throw new Error("listener failed");
        }
        await holdSlow(timer);
      };
      await s.scheduler.schedule("run_1", "slow", s.inMs(0));
      await s.scheduler.schedule("run_2", "flaky", s.inMs(0));

      await fireWakeUpsAfter(s, 0);
      expect(s.errors).toHaveLength(1);

      await fireWakeUpsAfter(s, second);
      expect(s.listener.timers.map((timer) => timer.timerId)).toEqual(["slow", "flaky", "flaky"]);
      expect(await s.scheduler.pending("run_2")).toEqual([]);

      slow.release();
      await s.scheduler.close();
    });

    it("delivers a timer during a slow tick, and wakes for the next tick after it", async () => {
      const s = startScheduler();
      const tick = holdTicks(s);
      await s.scheduler.schedule("run_1", "during-tick", s.inMs(minute + second));

      await fireWakeUpsAfter(s, minute);
      expect(s.listener.ticks).toHaveLength(1);
      expect(s.timers.delays.at(-1)).toBe(second);

      await fireWakeUpsAfter(s, second);
      expect(s.listener.timers.map((timer) => timer.timerId)).toEqual(["during-tick"]);

      tick.release();
      await fireWakeUpsAfter(s, 0);
      // The next tick is a minute after the first one started.
      expect(s.timers.delays.at(-1)).toBe(minute - second);
      await fireWakeUpsAfter(s, minute - second);
      expect(s.listener.ticks).toHaveLength(2);

      tick.release();
      await s.scheduler.close();
    });

    it("waits for a tick that runs past the next one, then catches up at once", async () => {
      const s = startScheduler();
      const tick = holdTicks(s);
      // Wait until the timers are loaded and the first wake-up is set.
      await s.scheduler.pending("run_1");

      await fireWakeUpsAfter(s, minute);
      const delaysDuringTick = s.timers.delays.length;
      await fireWakeUpsAfter(s, 2 * minute);
      // The overdue tick sets no wake-up while the first one runs, so it doesn't wake in a loop.
      expect(s.timers.delays.length).toBe(delaysDuringTick);
      expect(s.listener.ticks).toHaveLength(1);

      tick.release();
      await fireWakeUpsAfter(s, 0);
      expect(s.timers.delays.at(-1)).toBeLessThanOrEqual(0);
      await fireWakeUpsAfter(s, 0);
      expect(s.listener.ticks).toHaveLength(2);

      tick.release();
      await s.scheduler.close();
    });
  });
});
