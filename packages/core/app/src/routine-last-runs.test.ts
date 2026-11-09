import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { lastRunIndexKey, lastRunKey, routineRunId, shortHash } from "./routine-ids.ts";
import {
  ids,
  setUp,
  type TestRoutine,
  tickKey,
  workspace,
} from "./testing/routine-scheduler-harness.ts";

// The last run behind `{{trigger.lastRun}}`, kept by the scheduler itself.
verifies("app.workspace-routines", () => {
  it("reports a run as started when only storing its last run fails", async () => {
    const { scheduler, coordination, executor, ticks, at } = setUp([
      { key: "p/hourly", minute: 0 },
    ]);
    const write = coordination.compareAndSet.bind(coordination);
    coordination.compareAndSet = async (key, expected, next) => {
      if (key === lastRunKey(workspace, "p/hourly")) {
        throw new Error("coordination is down");
      }
      return write(key, expected, next);
    };
    await scheduler.tick();
    at("2026-11-03T08:00:20Z");
    const result = await scheduler.tick();
    const eight = routineRunId(workspace, "p/hourly", new Date("2026-11-03T08:00:00Z"));
    expect(ids(result.started)).toEqual([eight]);
    expect(result.failed).toEqual([]);
    expect(
      result.lastRunNotSaved.map((failure) => [failure.key, failure.at, failure.error.message]),
    ).toEqual([["p/hourly", "2026-11-03T08:00:00.000Z", "coordination is down"]]);
    expect(ticks.at(-1)).toMatchObject({ lastRunNotSaved: [{ key: "p/hourly" }] });
    // The tick went on as usual, and the run started once.
    expect(await coordination.read(tickKey)).toBe("2026-11-03T08:00:20.000Z");
    expect(executor.runs.size).toBe(1);
    expect(await coordination.read(lastRunKey(workspace, "p/hourly"))).toBeNull();
  });

  it("deletes the last run of a routine once it is no longer among the routines", async () => {
    const routines: TestRoutine[] = [
      { key: "p/hourly", minute: 0 },
      { key: "p/gone", minute: 0 },
    ];
    const { scheduler, coordination, at } = setUp(routines);
    await scheduler.tick();
    at("2026-11-03T08:00:20Z");
    await scheduler.tick();
    expect(await coordination.read(lastRunKey(workspace, "p/gone"))).toBe(
      "2026-11-03T08:00:00.000Z",
    );
    routines.pop();
    // Nothing is due at 08:30; the routine that stays keeps its last run all the same.
    at("2026-11-03T08:30:00Z");
    await scheduler.tick();
    expect(await coordination.read(lastRunKey(workspace, "p/gone"))).toBeNull();
    expect(await coordination.read(lastRunKey(workspace, "p/hourly"))).toBe(
      "2026-11-03T08:00:00.000Z",
    );
    expect(await coordination.read(lastRunIndexKey(workspace))).toBe(
      JSON.stringify([shortHash("p/hourly")]),
    );
    routines.pop();
    at("2026-11-03T08:40:00Z");
    await scheduler.tick();
    expect(await coordination.read(lastRunKey(workspace, "p/hourly"))).toBeNull();
    expect(await coordination.read(lastRunIndexKey(workspace))).toBeNull();
  });

  it("treats a damaged last-run index as empty", async () => {
    for (const damaged of ['["p/hourly"', '{"p/hourly": 1}', '["not a hash", 7]']) {
      const { scheduler, coordination, at } = setUp([{ key: "p/hourly", minute: 0 }]);
      await scheduler.tick();
      await coordination.compareAndSet(lastRunIndexKey(workspace), null, damaged);
      at("2026-11-03T08:00:20Z");
      expect((await scheduler.tick()).started).toHaveLength(1);
      expect(await coordination.read(lastRunIndexKey(workspace))).toBe(
        JSON.stringify([shortHash("p/hourly")]),
      );
    }
  });

  it("stores no last-run index too large for a Coordination value", async () => {
    const routines = Array.from({ length: 3_200 }, (_, index) => ({
      key: `p/r-${index}`,
      minute: 0,
    }));
    const { scheduler, coordination, at } = setUp(routines);
    await scheduler.tick();
    at("2026-11-03T08:00:20Z");
    expect((await scheduler.tick()).started).toHaveLength(3_200);
    expect(await coordination.read(lastRunIndexKey(workspace))).toBeNull();
  });
});
