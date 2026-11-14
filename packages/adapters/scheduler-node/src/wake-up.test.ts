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
      await s.wait(2 * minute);
      expect(s.listener.timers).toEqual([]);
      expect(s.listener.ticks).toEqual([]);
    });

    it("rejects schedule and cancel after close, and writes nothing", async () => {
      const s = startScheduler();
      await s.scheduler.schedule("run_1", "wait", s.inMs(second));
      await s.scheduler.close();
      const append = s.store.append.bind(s.store);
      let writes = 0;
      s.store.append = async (changes) => {
        writes += 1;
        await append(changes);
      };
      await expect(s.scheduler.schedule("run_1", "later", s.inMs(minute))).rejects.toThrow(
        "The scheduler is closed.",
      );
      await expect(s.scheduler.cancel("run_1", "wait")).rejects.toThrow("The scheduler is closed.");
      expect(writes).toBe(0);
      expect(s.timers.pendingCount).toBe(0);
    });

    it("writes nothing to the store after close has resolved", async () => {
      const s = startScheduler();
      await s.scheduler.pending("run_1");
      let releaseWrite = () => {};
      const writeHeld = new Promise<void>((resolve) => {
        releaseWrite = resolve;
      });
      const append = s.store.append.bind(s.store);
      let writeEnded = false;
      s.store.append = async (changes) => {
        await writeHeld;
        await append(changes);
        writeEnded = true;
      };
      // Not awaited: the change is still queued when the scheduler closes.
      const scheduled = s.scheduler.schedule("run_1", "wait", s.inMs(second));
      const closed = s.scheduler.close();
      await s.wait(0);
      releaseWrite();
      await closed;
      expect(writeEnded).toBe(true);
      await scheduled;
    });

    it("reports a store that fails while a delivery is recorded, and delivers the timer again a retry later", async () => {
      const s = startScheduler();
      const at = s.inMs(0);
      await s.scheduler.schedule("run_1", "step", at);
      s.store.failNextAppend = true;
      await s.wait(0);
      expect(s.errors).toHaveLength(1);
      expect(await s.scheduler.pending("run_1")).toEqual([{ key: "run_1", timerId: "step", at }]);
      // Not at once (HAL-5615): the timer waits a retry's 1 second.
      await s.wait(0);
      expect(s.listener.timers).toHaveLength(1);
      await s.wait(1000);
      expect(s.listener.timers).toEqual([
        { key: "run_1", timerId: "step", at },
        { key: "run_1", timerId: "step", at },
      ]);
      expect(await s.scheduler.pending("run_1")).toEqual([]);
    });
  });
});
