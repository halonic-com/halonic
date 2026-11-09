import { eventually, keepOnFailure } from "@halonicjs/testing-scenario";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { fail, newWorld, startScheduler } from "./harness.test-helper.ts";
import { defaultTimerCollection } from "./scheduler.ts";

// Scenario tests (docs/guides/scenario-tests.md): each test states one intent,
// its steps are named behaviours, and its checks read the store and the
// listener, not printed text. A fixed wait marks an exact time ("not before T,
// and at T"); eventually() marks "at some point within X".

const second = 1000;
const minute = 60 * second;

type Scheduler = ReturnType<typeof startScheduler>;

/**
 * A world for one test, and its steps. Call it inside the test: if the test
 * fails, the timer records in the store and what each scheduler delivered
 * are kept under test-results/scenarios.
 */
function restartScenario() {
  const world = newWorld();
  const started: Scheduler[] = [];
  keepOnFailure("timer-records", () => world.store.changes(defaultTimerCollection));
  keepOnFailure("deliveries", () =>
    started.map((scheduler) => ({ timers: scheduler.listener.timers, errors: scheduler.errors })),
  );

  /** The process starts: a scheduler on the world's store, clock and timers. */
  const start = (): Scheduler => {
    const scheduler = startScheduler(world);
    started.push(scheduler);
    return scheduler;
  };
  /** The process stops: the scheduler closes, and its timers stay in the store. */
  const stop = (scheduler: Scheduler) => scheduler.scheduler.close();
  return { world, start, stop, restart: start };
}

verifies("scheduler-node.restart", () => {
  describe("a restart", () => {
    it("must deliver a timer set before it, at the time it was due", async () => {
      const { start, stop, restart } = restartScenario();
      const before = start();
      const at = before.inMs(minute);
      await before.scheduler.schedule("run_1", "wait", at);
      await stop(before);

      const after = restart();
      expect(await after.scheduler.pending("run_1")).toEqual([
        { key: "run_1", timerId: "wait", at },
      ]);
      // Exact time: not a millisecond early, and on time.
      await after.wait(minute - 1);
      expect(after.listener.timers).toEqual([]);
      await after.wait(1);
      expect(after.listener.timers).toEqual([{ key: "run_1", timerId: "wait", at }]);
      expect(before.listener.timers).toEqual([]);
    });

    it("must forget timers that were delivered or cancelled before it", async () => {
      const { start, stop, restart } = restartScenario();
      const before = start();
      await before.scheduler.schedule("run_1", "done", before.inMs(0));
      await before.scheduler.schedule("run_1", "cancelled", before.inMs(minute));
      await before.scheduler.cancel("run_1", "cancelled");
      await before.wait(0);
      await stop(before);

      const after = restart();
      expect(await after.scheduler.pending("run_1")).toEqual([]);
    });

    it("must keep the failure count, so the back-off goes on where it was", async () => {
      const { start, stop, restart } = restartScenario();
      const before = start();
      before.listener.onTimerBehaviour = fail;
      await before.scheduler.schedule("run_1", "step", before.inMs(0));
      await before.wait(0);
      await before.wait(second);
      await stop(before);

      const after = restart();
      after.listener.onTimerBehaviour = fail;
      // Exact times: the third try is 2 s after the second, the fourth 4 s
      // after the third. eventually() would let an off-by-one back-off pass.
      await after.wait(2 * second);
      expect(after.listener.timers).toHaveLength(1);
      await after.wait(4 * second - 1);
      expect(after.listener.timers).toHaveLength(1);
      await after.wait(1);
      expect(after.listener.timers).toHaveLength(2);
    });

    it("must deliver again a timer whose delivery it cut off", async () => {
      const { start, restart } = restartScenario();
      const before = start();
      const at = before.inMs(0);
      // The listener never settles: the process stops while it runs.
      before.listener.onTimerBehaviour = () => new Promise(() => {});
      await before.scheduler.schedule("run_1", "step", at);
      before.timers.fireDue();
      await before.scheduler.pending("run_1");

      const after = restart();
      // Exact time: the timer is overdue, so it goes out at once.
      await after.wait(0);
      expect(after.listener.timers).toEqual([{ key: "run_1", timerId: "step", at }]);
    });

    it("must compact the log, so only the timers still waiting stay in the store", async () => {
      const { world, start, stop, restart } = restartScenario();
      const before = start();
      before.listener.onTimerBehaviour = async (timer) => {
        if (timer.timerId === "step") await fail();
      };
      await before.scheduler.schedule("run_1", "done", before.inMs(0));
      await before.scheduler.schedule("run_1", "cancelled", before.inMs(minute));
      await before.scheduler.cancel("run_1", "cancelled");
      await before.scheduler.schedule("run_1", "step", before.inMs(0));
      await before.wait(0);
      await before.wait(second);
      await stop(before);

      const after = restart();
      await after.scheduler.pending("run_1");
      const changes = await world.store.changes(defaultTimerCollection);
      expect(changes).toMatchObject([
        { op: "seed", id: '["run_1","step"]', values: { timerId: "step", failures: 2 } },
      ]);
    });

    it("must still deliver the timers it read when the store fails the compaction", async () => {
      const { world, start, stop, restart } = restartScenario();
      const before = start();
      const at = before.inMs(minute);
      await before.scheduler.schedule("run_1", "wait", at);
      await stop(before);

      world.store.failNextCompact = true;
      const after = restart();
      expect(await after.scheduler.pending("run_1")).toEqual([
        { key: "run_1", timerId: "wait", at },
      ]);
      // At some point within the minute: the intent is that it still delivers.
      await eventually(
        () => expect(after.listener.timers).toEqual([{ key: "run_1", timerId: "wait", at }]),
        { intent: "the timer is delivered", within: minute, every: second, wait: after.wait },
      );
      expect(after.errors).toEqual([]);
    });

    it("must reject every call, naming the record, when a record isn't a timer", async () => {
      const { world, start } = restartScenario();
      await world.store.append([
        {
          at: new Date(0).toISOString(),
          collection: defaultTimerCollection,
          id: '["run_1","wait"]',
          op: "add",
          values: { key: "run_1", timerId: "wait", at: 42, failures: 0, dueAt: "2026-01-01" },
        },
      ]);
      const s = start();
      await expect(s.scheduler.pending("run_1")).rejects.toThrow('["run_1","wait"]');
      await expect(s.scheduler.schedule("run_1", "b", s.inMs(0))).rejects.toThrow("not a timer");
      await expect(s.scheduler.deliverDue()).rejects.toThrow("not a timer");
      expect(s.errors.map((entry) => entry.source)).toEqual(["wake-up"]);
      expect(await world.store.changes(defaultTimerCollection)).toMatchObject([{ op: "add" }]);
    });
  });
});
