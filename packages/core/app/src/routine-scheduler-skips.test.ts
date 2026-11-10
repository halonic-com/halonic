import { parseFile } from "@halonicjs/format";
import type { PlacedRoutine } from "@halonicjs/routines";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { queueKey } from "./routine-ids.ts";
import { TestCoordination } from "./testing/memory-coordination.ts";
import { ids, setUp, workspace } from "./testing/routine-scheduler-harness.ts";
import { TestExecutor } from "./testing/test-executor.ts";
import { workspaceRoutineScheduler } from "./workspace-routines.ts";

// The Acme example of the skipped-and-catch-up document (HAL-2538), in UTC:
// the laptop slept from Fri 6 Nov 18:00 and woke on Mon 9 Nov at 08:12.
function supportReplies(catchUp: string): PlacedRoutine {
  const text = [
    "id: support-replies",
    "name: Support replies",
    'trigger: { schedule: "0 * * * *", timezone: UTC }',
    `catchUp: ${catchUp}`,
    "run: { workflow: support-reply }",
  ].join("\n");
  const parsed = parseFile("routine", text, { id: "support-replies" });
  if (!parsed.ok) {
    throw new Error(parsed.error.map((problem) => problem.message).join("; "));
  }
  return { hub: "acme", routine: parsed.value.value };
}

function afterSleep(catchUp: string) {
  let now = Date.parse("2026-11-06T18:00:00Z");
  const executor = new TestExecutor();
  const scheduler = workspaceRoutineScheduler({
    workspaceId: workspace,
    clock: { now: () => new Date(now) },
    coordination: new TestCoordination(),
    executor,
    runs: executor,
    routines: async () => [supportReplies(catchUp)],
  });
  const tickAt = (iso: string) => {
    now = Date.parse(iso);
    return scheduler.tick();
  };
  return { scheduler, executor, tickAt };
}

verifies("app.scheduler-keeps-skips", () => {
  it("starts a late run with trigger.catchUp and records what the rule dropped", async () => {
    const { scheduler, executor, tickAt } = afterSleep("last");
    await tickAt("2026-11-06T18:00:00Z");
    await tickAt("2026-11-09T08:12:00Z");
    expect(executor.requests.map((request) => request.trigger)).toEqual([
      {
        type: "schedule",
        routineId: "acme/support-replies",
        at: "2026-11-09T08:00:00.000Z",
        catchUp: { skipped: 61 },
      },
    ]);
    expect(await scheduler.skippedTimes("acme/support-replies")).toEqual([
      {
        reason: "latest",
        from: "2026-11-06T19:00:00.000Z",
        to: "2026-11-09T07:00:00.000Z",
        count: 61,
        decidedAt: "2026-11-09T08:12:00.000Z",
      },
    ]);
  });

  it("records missed times with catch-up off, and starts a run on time without the flag", async () => {
    const { scheduler, executor, tickAt } = afterSleep("none");
    await tickAt("2026-11-06T18:00:00Z");
    await tickAt("2026-11-09T08:12:00Z");
    expect(executor.requests).toEqual([]);
    expect(await scheduler.skippedTimes("acme/support-replies")).toMatchObject([
      { reason: "missed", count: 62 },
    ]);
    await tickAt("2026-11-09T09:00:20Z");
    expect(executor.requests.map((request) => request.trigger)).toEqual([
      { type: "schedule", routineId: "acme/support-replies", at: "2026-11-09T09:00:00.000Z" },
    ]);
  });

  it("records busy skips, continuing the row until a run starts", async () => {
    const { scheduler, executor, at } = setUp([{ key: "p/hourly", minute: 0, overlap: "skip" }]);
    await scheduler.tick();
    at("2026-11-03T08:00:20Z");
    const first = await scheduler.tick();
    at("2026-11-03T09:00:20Z");
    await scheduler.tick();
    at("2026-11-03T10:00:20Z");
    await scheduler.tick();
    expect(await scheduler.skippedTimes("p/hourly")).toMatchObject([
      {
        reason: "busy",
        from: "2026-11-03T09:00:00.000Z",
        to: "2026-11-03T10:00:00.000Z",
        count: 2,
      },
    ]);
    executor.end(ids(first.started)[0] ?? "");
    at("2026-11-03T11:00:20Z");
    const third = await scheduler.tick();
    at("2026-11-03T12:00:20Z");
    await scheduler.tick();
    expect(third.started.length).toBe(1);
    expect((await scheduler.skippedTimes("p/hourly")).map((row) => [row.from, row.count])).toEqual([
      ["2026-11-03T12:00:00.000Z", 1],
      ["2026-11-03T09:00:00.000Z", 2],
    ]);
  });

  it("records a queued time as changed when its routine no longer runs then", async () => {
    const routine = { key: "p/hourly", minute: 0, overlap: "queue" as const };
    const { scheduler, executor, at } = setUp([routine]);
    await scheduler.tick();
    at("2026-11-03T08:00:20Z");
    const first = await scheduler.tick();
    at("2026-11-03T09:00:20Z");
    expect((await scheduler.tick()).queued.length).toBe(1);
    executor.end(ids(first.started)[0] ?? "");
    routine.minute = 30;
    at("2026-11-03T09:10:00Z");
    await scheduler.tick();
    expect(await scheduler.skippedTimes("p/hourly")).toMatchObject([
      { reason: "changed", from: "2026-11-03T09:00:00.000Z", count: 1 },
    ]);
  });

  it("keeps no rows for a removed routine, and notes an unreadable queue", async () => {
    const routines = [{ key: "p/hourly", minute: 0, overlap: "skip" as const }];
    const { scheduler, coordination, at } = setUp(routines);
    await scheduler.tick();
    at("2026-11-03T08:00:20Z");
    await scheduler.tick();
    at("2026-11-03T09:00:20Z");
    await scheduler.tick();
    expect((await scheduler.skippedTimes("p/hourly")).length).toBe(1);
    routines.pop();
    coordination.values.set(queueKey(workspace), "{damaged");
    at("2026-11-03T10:00:20Z");
    await scheduler.tick();
    expect(await scheduler.skippedTimes("p/hourly")).toEqual([]);
    expect(await scheduler.lastQueueLoss()).toBe("2026-11-03T10:00:20.000Z");
  });

  it("reports skips it couldn't store and still starts the runs", async () => {
    const { scheduler, coordination, at } = setUp([
      { key: "p/hourly", minute: 0, overlap: "skip" },
      { key: "p/other", minute: 5 },
    ]);
    await scheduler.tick();
    at("2026-11-03T08:05:20Z");
    await scheduler.tick();
    const compareAndSet = coordination.compareAndSet.bind(coordination);
    coordination.compareAndSet = (key, expected, next) =>
      key.includes("/skips/")
        ? Promise.reject(new Error("store is offline"))
        : compareAndSet(key, expected, next);
    at("2026-11-03T09:05:20Z");
    const result = await scheduler.tick();
    expect(result.skipsNotSaved).toEqual([
      { key: "p/hourly", error: new Error("store is offline") },
    ]);
    expect(result.started.map((run) => run.trigger?.routineId)).toEqual(["p/other"]);
  });
});
