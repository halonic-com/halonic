import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { fail, newWorld, startScheduler } from "./harness.test-helper.ts";
import { defaultTimerCollection } from "./scheduler.ts";

const second = 1000;
const minute = 60 * second;

verifies("scheduler-node.restart", () => {
  describe("surviving a restart", () => {
    it("delivers a timer the scheduler before the restart set", async () => {
      const world = newWorld();
      const before = startScheduler(world);
      const at = before.inMs(minute);
      await before.scheduler.schedule("run_1", "wait", at);
      await before.scheduler.close();

      const after = startScheduler(world);
      expect(await after.scheduler.pending("run_1")).toEqual([
        { key: "run_1", timerId: "wait", at },
      ]);
      await after.wait(minute);
      expect(after.listener.timers).toEqual([{ key: "run_1", timerId: "wait", at }]);
      expect(before.listener.timers).toEqual([]);
    });

    it("forgets timers that were delivered or cancelled before the restart", async () => {
      const world = newWorld();
      const before = startScheduler(world);
      await before.scheduler.schedule("run_1", "done", before.inMs(0));
      await before.scheduler.schedule("run_1", "cancelled", before.inMs(minute));
      await before.scheduler.cancel("run_1", "cancelled");
      await before.wait(0);
      await before.scheduler.close();

      const after = startScheduler(world);
      expect(await after.scheduler.pending("run_1")).toEqual([]);
    });

    it("keeps the failure count, so the back-off goes on where it was", async () => {
      const world = newWorld();
      const before = startScheduler(world);
      before.listener.onTimerBehaviour = fail;
      await before.scheduler.schedule("run_1", "step", before.inMs(0));
      await before.wait(0);
      await before.wait(second);
      await before.scheduler.close();

      const after = startScheduler(world);
      after.listener.onTimerBehaviour = fail;
      await after.wait(2 * second);
      expect(after.listener.timers).toHaveLength(1);
      await after.wait(4 * second - 1);
      expect(after.listener.timers).toHaveLength(1);
      await after.wait(1);
      expect(after.listener.timers).toHaveLength(2);
    });

    it("delivers again a timer whose delivery the restart cut off", async () => {
      const world = newWorld();
      const before = startScheduler(world);
      const at = before.inMs(0);
      // The listener never settles: the process stops while it runs.
      before.listener.onTimerBehaviour = () => new Promise(() => {});
      await before.scheduler.schedule("run_1", "step", at);
      before.timers.fireDue();
      await before.scheduler.pending("run_1");

      const after = startScheduler(world);
      await after.wait(0);
      expect(after.listener.timers).toEqual([{ key: "run_1", timerId: "step", at }]);
    });

    it("rejects every call, naming the record, when a record isn't a timer", async () => {
      const world = newWorld();
      await world.store.append([
        {
          at: new Date(0).toISOString(),
          collection: defaultTimerCollection,
          id: '["run_1","wait"]',
          op: "add",
          values: { key: "run_1", timerId: "wait", at: 42, failures: 0, dueAt: "2026-01-01" },
        },
      ]);
      const s = startScheduler(world);
      await expect(s.scheduler.pending("run_1")).rejects.toThrow('["run_1","wait"]');
      await expect(s.scheduler.schedule("run_1", "b", s.inMs(0))).rejects.toThrow("not a timer");
      await expect(s.scheduler.deliverDue()).rejects.toThrow("not a timer");
      expect(s.errors.map((entry) => entry.source)).toEqual(["wake-up"]);
    });
  });
});
