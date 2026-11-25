import { parseFile } from "@halonicjs/format";
import {
  DEFAULT_TICK_POLICY,
  dueWithSkips,
  type PlacedRoutine,
  routineKey,
} from "@halonicjs/routines";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { RoutineScheduler } from "./routine-scheduler.ts";
import { TestCoordination } from "./testing/memory-coordination.ts";
import { setUp, tickKey, workspace } from "./testing/routine-scheduler-harness.ts";
import { TestExecutor } from "./testing/test-executor.ts";
import { startOfDueRun, workspaceRoutineScheduler } from "./workspace-routines.ts";

function acmeRoutine(schedule: string, catchUp: string): PlacedRoutine {
  const text = [
    "id: support-replies",
    "name: Support replies",
    `trigger: { schedule: "${schedule}", timezone: UTC }`,
    `catchUp: ${catchUp}`,
    "run: { workflow: support-reply }",
  ].join("\n");
  const parsed = parseFile("routine", text, { id: "support-replies" });
  if (!parsed.ok) {
    throw new Error(parsed.error.map((problem) => problem.message).join("; "));
  }
  return { hub: "acme", routine: parsed.value.value };
}

/** A scheduler of the real routines package, with the clock at `iso` for each step. */
function acme(routines: () => Promise<readonly PlacedRoutine[]>) {
  let now = 0;
  const executor = new TestExecutor();
  const scheduler = workspaceRoutineScheduler({
    workspaceId: workspace,
    clock: { now: () => new Date(now) },
    coordination: new TestCoordination(),
    executor,
    runs: executor,
    routines,
  });
  const at = (iso: string) => {
    now = Date.parse(iso);
    return scheduler;
  };
  return { executor, at };
}

verifies("app.routine-pass-skips", () => {
  it("records the times due between passes as one paused row, and a run ends it", async () => {
    const { scheduler, at } = setUp([{ key: "p/hourly", minute: 0 }]);
    await scheduler.tick();
    at("2026-11-03T08:30:00Z");
    expect(await scheduler.pass()).toEqual({
      stored: true,
      skipsSaved: ["p/hourly"],
      skipsNotSaved: [],
    });
    at("2026-11-03T09:30:00Z");
    await scheduler.pass();
    expect(await scheduler.skippedTimes("p/hourly")).toEqual([
      {
        reason: "paused",
        from: "2026-11-03T08:00:00.000Z",
        to: "2026-11-03T09:00:00.000Z",
        count: 2,
        decidedAt: "2026-11-03T09:30:00.000Z",
      },
    ]);
    at("2026-11-03T10:00:30Z");
    await scheduler.tick();
    at("2026-11-03T11:30:00Z");
    await scheduler.pass();
    const rows = await scheduler.skippedTimes("p/hourly");
    expect(rows.map((row) => [row.reason, row.from, row.count])).toEqual([
      ["paused", "2026-11-03T11:00:00.000Z", 1],
      ["paused", "2026-11-03T08:00:00.000Z", 2],
    ]);
  });

  it.each(["none", "last", "all"])("records every time with catch-up %s", async (catchUp) => {
    const { executor, at } = acme(async () => [acmeRoutine("0 * * * *", catchUp)]);
    await at("2026-11-06T18:00:00Z").tick();
    const scheduler = at("2026-11-09T08:12:00Z");
    await scheduler.pass();
    expect(executor.requests).toEqual([]);
    expect(await scheduler.skippedTimes("acme/support-replies")).toEqual([
      {
        reason: "paused",
        from: "2026-11-06T19:00:00.000Z",
        to: "2026-11-09T08:00:00.000Z",
        count: 62,
        decidedAt: "2026-11-09T08:12:00.000Z",
      },
    ]);
  });

  it("counts a long pause of a frequent routine without listing every time", async () => {
    const routines = [acmeRoutine("* * * * *", "all")];
    let now = Date.parse("2026-10-04T08:00:00Z");
    const listed: number[] = [];
    const executor = new TestExecutor();
    const scheduler = new RoutineScheduler({
      workspaceId: workspace,
      clock: { now: () => new Date(now) },
      coordination: new TestCoordination(),
      executor,
      runs: executor,
      routines: async () => routines,
      keyOf: routineKey,
      due: (list, lastTick, at, policy) => {
        const tick = dueWithSkips(list, lastTick, at, policy);
        listed.push(tick.runs.length);
        return tick;
      },
      policy: DEFAULT_TICK_POLICY,
      startOf: startOfDueRun,
      overlapOf: () => "allow",
    });
    await scheduler.tick();
    now = Date.parse("2026-11-03T08:00:00Z");
    await scheduler.pass();
    // Thirty days of minutes; the times past the catch-up window are counted up to a limit.
    expect(listed).toEqual([0, 100]);
    expect(await scheduler.skippedTimes("acme/support-replies")).toEqual([
      expect.objectContaining({
        reason: "paused",
        from: "2026-10-04T08:01:00.000Z",
        to: "2026-11-03T08:00:00.000Z",
        countIsMinimum: true,
      }),
    ]);
  });

  it("records nothing when no time fell due", async () => {
    const { scheduler, at } = setUp([{ key: "p/hourly", minute: 0 }]);
    await scheduler.tick();
    at("2026-11-03T07:30:00Z");
    expect(await scheduler.pass()).toEqual({ stored: true, skipsSaved: [], skipsNotSaved: [] });
    expect(await scheduler.skippedTimes("p/hourly")).toEqual([]);
  });

  it("records nothing when another tick stored its last tick first", async () => {
    const { scheduler, coordination, at } = setUp([{ key: "p/hourly", minute: 0 }]);
    await scheduler.tick();
    const compareAndSet = coordination.compareAndSet.bind(coordination);
    coordination.compareAndSet = async (key, expected, next) => {
      // Another host's tick lands between the pass's read and its write.
      if (key === tickKey) coordination.values.set(tickKey, "2026-11-03T09:29:00.000Z");
      return compareAndSet(key, expected, next);
    };
    at("2026-11-03T09:30:00Z");
    expect(await scheduler.pass()).toEqual({ stored: false, skipsSaved: [], skipsNotSaved: [] });
    expect(await scheduler.skippedTimes("p/hourly")).toEqual([]);
  });

  it("still moves the last tick when the routines can't be read, then rejects", async () => {
    let unreadable = false;
    const routines = async () => {
      if (unreadable) throw new Error("routines.yaml can't be read");
      return [acmeRoutine("0 * * * *", "all")];
    };
    const { at } = acme(routines);
    await at("2026-11-06T18:00:00Z").tick();
    unreadable = true;
    const scheduler = at("2026-11-09T08:12:00Z");
    await expect(scheduler.pass()).rejects.toThrow("routines.yaml can't be read");
    unreadable = false;
    expect((await at("2026-11-09T09:00:10Z").tick()).started).toHaveLength(1);
    expect(await scheduler.skippedTimes("acme/support-replies")).toEqual([]);
  });

  it("does nothing while a tick of the same scheduler runs", async () => {
    const { scheduler, at } = setUp([{ key: "p/hourly", minute: 0 }]);
    await scheduler.tick();
    at("2026-11-03T08:30:00Z");
    const tick = scheduler.tick();
    expect(await scheduler.pass()).toEqual({ stored: false, skipsSaved: [], skipsNotSaved: [] });
    expect((await tick).started).toHaveLength(1);
  });
});
