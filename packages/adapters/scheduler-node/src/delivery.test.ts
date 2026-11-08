import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { fail, startScheduler } from "./harness.test-helper.ts";
import { retryWait } from "./scheduler.ts";

const second = 1000;
const minute = 60 * second;

verifies("adapter-scheduler-node.delivery", () => {
  describe("delivering timers", () => {
    it("delivers a timer when it is due and not before, then removes it", async () => {
      const s = startScheduler();
      const at = s.inMs(5 * second);
      await s.scheduler.schedule("run_1", "wait", at);
      await s.wait(4 * second);
      expect(s.listener.timers).toEqual([]);
      await s.wait(second);
      expect(s.listener.timers).toEqual([{ key: "run_1", timerId: "wait", at }]);
      expect(await s.scheduler.pending("run_1")).toEqual([]);
    });

    it("treats a time in the past as due at once", async () => {
      const s = startScheduler();
      const at = s.inMs(-minute);
      await s.scheduler.schedule("run_1", "late", at);
      await s.wait(0);
      expect(s.listener.timers).toEqual([{ key: "run_1", timerId: "late", at }]);
    });

    it("moves a timer that is set again, and never delivers it at the old time", async () => {
      const s = startScheduler();
      await s.scheduler.schedule("run_1", "wait", s.inMs(second));
      const moved = s.inMs(minute);
      await s.scheduler.schedule("run_1", "wait", moved);
      await s.wait(30 * second);
      expect(s.listener.timers).toEqual([]);
      await s.wait(30 * second);
      expect(s.listener.timers).toEqual([{ key: "run_1", timerId: "wait", at: moved }]);
    });

    it("lists a key's timers earliest first, and cancelling a missing one is fine", async () => {
      const s = startScheduler();
      const [early, late] = [s.inMs(second), s.inMs(minute)];
      await s.scheduler.schedule("run_1", "b", late);
      await s.scheduler.schedule("run_1", "a", early);
      await s.scheduler.schedule("run_2", "c", early);
      await s.scheduler.cancel("run_2", "c");
      await s.scheduler.cancel("run_2", "c");
      expect(await s.scheduler.pending("run_1")).toEqual([
        { key: "run_1", timerId: "a", at: early },
        { key: "run_1", timerId: "b", at: late },
      ]);
      expect(await s.scheduler.pending("run_2")).toEqual([]);
    });
  });

  describe("retries", () => {
    it("waits 1 second after the first failure, doubling, at most 15 minutes", () => {
      const waits = [1, 2, 3, 10, 11, 12, 40].map(retryWait);
      expect(waits).toEqual([
        second,
        2 * second,
        4 * second,
        512 * second,
        15 * minute,
        15 * minute,
        15 * minute,
      ]);
    });

    it("delivers a rejected timer again after 1, 2 and 4 seconds, and reports each failure", async () => {
      const s = startScheduler();
      let calls = 0;
      s.listener.onTimerBehaviour = async () => {
        calls += 1;
        if (calls <= 3) await fail();
      };
      await s.scheduler.schedule("run_1", "step", s.inMs(0));
      await s.wait(0);
      for (const waitMs of [second, 2 * second, 4 * second]) {
        const before = s.listener.timers.length;
        await s.wait(waitMs - 1);
        expect(s.listener.timers).toHaveLength(before);
        await s.wait(1);
        expect(s.listener.timers).toHaveLength(before + 1);
      }
      expect(await s.scheduler.pending("run_1")).toEqual([]);
      expect(s.errors.map((entry) => entry.source)).toEqual([
        s.listener.timers[0],
        s.listener.timers[0],
        s.listener.timers[0],
      ]);
    });

    it("keeps a timer the listener set again during a call that rejects", async () => {
      const s = startScheduler();
      const first = s.inMs(0);
      const next = s.inMs(10 * minute);
      s.listener.onTimerBehaviour = async (timer) => {
        if (timer.at !== first) return;
        await s.scheduler.schedule(timer.key, timer.timerId, next);
        await fail();
      };
      await s.scheduler.schedule("run_1", "retry", first);
      await s.wait(0);
      await s.wait(second);
      expect(s.listener.timers.map((timer) => timer.at)).toEqual([first]);
      expect(await s.scheduler.pending("run_1")).toEqual([
        { key: "run_1", timerId: "retry", at: next },
      ]);
      await s.wait(10 * minute);
      expect(s.listener.timers.map((timer) => timer.at)).toEqual([first, next]);
    });

    it("drops a timer the listener cancelled during a call that rejects", async () => {
      const s = startScheduler();
      s.listener.onTimerBehaviour = async (timer) => {
        await s.scheduler.cancel(timer.key, timer.timerId);
        await fail();
      };
      await s.scheduler.schedule("run_1", "wait", s.inMs(0));
      await s.wait(0);
      await s.wait(15 * minute);
      expect(s.listener.timers).toHaveLength(1);
      expect(await s.scheduler.pending("run_1")).toEqual([]);
    });
  });

  describe("ticks", () => {
    it("ticks about once a minute with the tick's time, and a rejecting tick stops nothing", async () => {
      const s = startScheduler();
      s.listener.onTickBehaviour = fail;
      await s.scheduler.schedule("run_1", "wait", s.inMs(2 * minute));
      await s.wait(minute);
      await s.wait(minute);
      expect(s.listener.ticks).toEqual([s.inMs(-minute), s.inMs(0)]);
      expect(s.listener.timers).toHaveLength(1);
      expect(s.errors.map((entry) => entry.source)).toEqual(["tick", "tick"]);
    });

    it("ticks once after a long gap, and leaves the catching up to the listener", async () => {
      const s = startScheduler();
      await s.wait(10 * minute);
      expect(s.listener.ticks).toEqual([s.inMs(0)]);
    });
  });

  describe("input rules", () => {
    it("refuses a key or timer id over 256 UTF-8 bytes, and takes one of exactly 256", async () => {
      const s = startScheduler();
      const at = s.inMs(minute);
      const tooLong = "é".repeat(129);
      await expect(s.scheduler.schedule(tooLong, "wait", at)).rejects.toThrow(RangeError);
      await expect(s.scheduler.schedule("run_1", tooLong, at)).rejects.toThrow(RangeError);
      const longest = "é".repeat(128);
      await s.scheduler.schedule(longest, longest, at);
      expect(await s.scheduler.pending(longest)).toEqual([{ key: longest, timerId: longest, at }]);
    });

    it("refuses a time that isn't one, and stores nothing", async () => {
      const s = startScheduler();
      await expect(s.scheduler.schedule("run_1", "wait", "soon")).rejects.toThrow(RangeError);
      expect(await s.store.changes("halonic.scheduler.timers")).toEqual([]);
      expect(await s.scheduler.pending("run_1")).toEqual([]);
    });
  });
});
