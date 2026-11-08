import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { startScheduler } from "./harness.test-helper.ts";

const second = 1000;
const minute = 60 * second;

verifies("scheduler-node.wake-up", () => {
  describe("waking itself", () => {
    it("asks to be woken for the tick when there are no timers", async () => {
      const s = startScheduler();
      await s.scheduler.pending("run_1");
      expect(s.timers.delays).toEqual([minute]);
      expect(s.timers.pendingCount).toBe(1);
    });

    it("asks to be woken when the next timer is due, and delivers it without being called", async () => {
      const s = startScheduler();
      const at = s.inMs(5 * second);
      await s.scheduler.schedule("run_1", "wait", at);
      expect(s.timers.delays.at(-1)).toBe(5 * second);
      expect(s.timers.pendingCount).toBe(1);

      const delivered = new Promise<void>((resolve) => {
        s.listener.onTimerBehaviour = async () => resolve();
      });
      s.clock.advance(5 * second);
      // Only the wake-up delivers here: nothing calls deliverDue.
      s.timers.fireDue();
      await delivered;
      expect(s.listener.timers).toEqual([{ key: "run_1", timerId: "wait", at }]);
    });

    it("wakes for a retry 1 second after a failure", async () => {
      const s = startScheduler();
      s.listener.onTimerBehaviour = async () => {
        throw new Error("listener failed");
      };
      await s.scheduler.schedule("run_1", "step", s.inMs(0));
      await s.wait(0);
      expect(s.timers.delays.at(-1)).toBe(second);
    });

    it("sets no more wake-ups and delivers nothing after close", async () => {
      const s = startScheduler();
      await s.scheduler.schedule("run_1", "wait", s.inMs(second));
      await s.scheduler.close();
      expect(s.timers.pendingCount).toBe(0);
      await s.scheduler.schedule("run_1", "later", s.inMs(minute));
      expect(s.timers.pendingCount).toBe(0);
      await s.wait(2 * minute);
      expect(s.listener.timers).toEqual([]);
      expect(s.listener.ticks).toEqual([]);
    });

    it("reports a store that fails while a delivery is recorded, and delivers the timer again", async () => {
      const s = startScheduler();
      const at = s.inMs(0);
      await s.scheduler.schedule("run_1", "step", at);
      s.store.failNextAppend = true;
      await s.wait(0);
      expect(s.errors).toHaveLength(1);
      expect(await s.scheduler.pending("run_1")).toEqual([{ key: "run_1", timerId: "step", at }]);
      await s.wait(0);
      expect(s.listener.timers).toEqual([
        { key: "run_1", timerId: "step", at },
        { key: "run_1", timerId: "step", at },
      ]);
      expect(await s.scheduler.pending("run_1")).toEqual([]);
    });
  });
});
