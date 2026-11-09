import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { newWorld, startScheduler } from "./harness.test-helper.ts";
import { defaultTimerCollection } from "./scheduler.ts";

const at = "2026-01-01T00:00:00.000Z";
const timer = { key: "run_1", timerId: "wait", at, failures: 0, dueAt: at };

verifies("scheduler-node.restart", () => {
  describe("loading a damaged timer log", () => {
    it.each([
      ["no key", { ...timer, key: undefined }],
      ["a key that isn't text", { ...timer, key: 1 }],
      ["no timer id", { ...timer, timerId: undefined }],
      ["an at that isn't a time", { ...timer, at: "tomorrow" }],
      ["failures written as text", { ...timer, failures: "0" }],
      ["failures below zero", { ...timer, failures: -1 }],
      ["failures that aren't whole", { ...timer, failures: 0.5 }],
      ["failures above the largest safe whole number", { ...timer, failures: 2 ** 53 }],
      ["no dueAt", { ...timer, dueAt: undefined }],
      ["a dueAt in ms", { ...timer, dueAt: 0 }],
      ["a dueAt that isn't a time", { ...timer, dueAt: "later" }],
      ["no values", {}],
    ])("rejects a record with %s, naming it, and delivers nothing", async (_, values) => {
      const world = newWorld();
      const changes = [
        { at, collection: defaultTimerCollection, id: '["x","y"]', op: "add" as const, values },
      ];
      await world.store.append(changes);
      const s = startScheduler(world);

      await expect(s.scheduler.pending("run_1")).rejects.toThrow(
        'Scheduler record ["x","y"] is not a timer',
      );
      await expect(s.scheduler.deliverDue()).rejects.toThrow("not a timer");
      expect(s.listener.timers).toEqual([]);
      expect(await world.store.changes(defaultTimerCollection)).toEqual(changes);
    });

    it("rejects an update whose add was never written, as after a half-written log", async () => {
      const world = newWorld();
      const changes = [
        {
          at,
          collection: defaultTimerCollection,
          id: '["run_1","wait"]',
          op: "update" as const,
          values: { failures: 1, dueAt: at },
        },
      ];
      await world.store.append(changes);
      const s = startScheduler(world);

      await expect(s.scheduler.pending("run_1")).rejects.toThrow('["run_1","wait"]');
      await expect(s.scheduler.deliverDue()).rejects.toThrow('["run_1","wait"]');
      expect(s.listener.timers).toEqual([]);
      expect(await world.store.changes(defaultTimerCollection)).toEqual(changes);
    });
  });
});
