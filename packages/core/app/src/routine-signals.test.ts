import type { RunTrigger } from "@halonicjs/events";
import { parseFile } from "@halonicjs/format";
import type { PlacedRoutine } from "@halonicjs/routines";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { signalRunId } from "./routine-ids.ts";
import { TestCoordination } from "./testing/memory-coordination.ts";
import { TestExecutor } from "./testing/test-executor.ts";
import { workspaceRoutineScheduler } from "./workspace-routines.ts";

// Real routine files through the real tick functions, with the kernel's
// fakes for the ports. A "sender" run is a run the executor started, given
// the signals it sent, as its summary lists them.

const workspace = "ws-4e17a2";

/** A routine in the hub `billing` that starts the workflow `thank` on `invoice.paid`. */
function onPaid(id: string, overlap = "allow", extra: string[] = []): PlacedRoutine {
  const text = [
    `id: ${id}`,
    "name: Thank the vendor",
    "trigger: { signal: { name: invoice.paid } }",
    `overlap: ${overlap}`,
    'run: { workflow: thank, input: { vendor: "{{trigger.signal.vendor}}", sent: "{{trigger.at}}" } }',
    ...extra,
  ].join("\n");
  const parsed = parseFile("routine", text, { id });
  if (!parsed.ok) throw new Error(parsed.error.map((problem) => problem.message).join("; "));
  return { hub: "billing", routine: parsed.value.value };
}

function setUp(routines: PlacedRoutine[], start = "2026-11-03T10:00:00Z") {
  let now = Date.parse(start);
  const coordination = new TestCoordination();
  const executor = new TestExecutor();
  const list = { routines };
  const scheduler = workspaceRoutineScheduler({
    workspaceId: workspace,
    clock: { now: () => new Date(now) },
    coordination,
    executor,
    runs: executor,
    routines: async () => list.routines,
  });
  const tickAt = (iso: string) => {
    now = Date.parse(iso);
    return scheduler.tick();
  };
  /** Starts a run that sends `invoice.paid` once per vendor, at `at`, and ends it. */
  const send = async (
    runId: string,
    at: string,
    vendors: string[],
    trigger: RunTrigger | null = null,
  ) => {
    const run = await executor.start({ hubId: "billing", workflowId: "invoice", input: {}, runId });
    const signals = vendors.map((vendor, n) => ({
      id: `${runId}:${n + 1}`,
      name: "invoice.paid",
      data: { vendor },
      at,
    }));
    executor.runs.set(runId, { ...run, trigger: trigger ?? run.trigger, signals });
    executor.end(runId);
  };
  return { coordination, executor, scheduler, list, tickAt, send };
}

const startedFor = (key: string, at: string, signalId: string) =>
  signalRunId(workspace, key, new Date(at), signalId);

verifies("app.scheduler-starts-signal-routines", () => {
  it("starts a routine on a signal, with the signal's data and its own run id", async () => {
    const { executor, tickAt, send } = setUp([onPaid("thanks")]);
    await tickAt("2026-11-03T10:00:00Z");
    await send("sender-1", "2026-11-03T10:00:30.000Z", ["Acme"]);
    const result = await tickAt("2026-11-03T10:01:00Z");
    expect(result.started.map((run) => run.id)).toEqual([
      startedFor("billing/thanks", "2026-11-03T10:00:30.000Z", "sender-1:1"),
    ]);
    expect(executor.requests.at(-1)).toEqual({
      hubId: "billing",
      workflowId: "thank",
      input: { vendor: "Acme", sent: "2026-11-03T10:00:30.000Z" },
      trigger: {
        type: "signal",
        routineId: "billing/thanks",
        at: "2026-11-03T10:00:30.000Z",
        signalId: "sender-1:1",
      },
      runId: startedFor("billing/thanks", "2026-11-03T10:00:30.000Z", "sender-1:1"),
    });
  });

  it("starts nothing on the first tick, nor for a routine that is off", async () => {
    const off = onPaid("off", "allow", ["enabled: false"]);
    const { tickAt, send } = setUp([onPaid("thanks"), off]);
    await send("sender-1", "2026-11-03T09:50:00.000Z", ["Acme"]);
    expect((await tickAt("2026-11-03T10:00:00Z")).started).toEqual([]);
    await send("sender-2", "2026-11-03T10:00:30.000Z", ["Acme"]);
    const result = await tickAt("2026-11-03T10:01:00Z");
    expect(result.started.map((run) => run.trigger?.routineId)).toEqual(["billing/thanks"]);
  });

  it("starts once for a signal two ticks and two hosts see", async () => {
    const { executor, coordination, tickAt, send } = setUp([onPaid("thanks")]);
    await tickAt("2026-11-03T10:00:00Z");
    await send("sender-1", "2026-11-03T10:00:50.000Z", ["Acme"]);
    await tickAt("2026-11-03T10:01:00Z");
    executor.end(startedFor("billing/thanks", "2026-11-03T10:00:50.000Z", "sender-1:1"));
    const other = workspaceRoutineScheduler({
      workspaceId: workspace,
      clock: { now: () => new Date("2026-11-03T10:01:30Z") },
      coordination,
      executor,
      runs: executor,
      routines: async () => [onPaid("thanks")],
    });
    expect((await other.tick()).started).toEqual([]);
    expect((await tickAt("2026-11-03T10:02:00Z")).started).toEqual([]);
    expect(executor.requests.filter((request) => request.trigger?.type === "signal")).toHaveLength(
      1,
    );
  });

  it("never starts a routine on a signal its own run sent, and records why", async () => {
    const { scheduler, tickAt, send } = setUp([onPaid("thanks")]);
    await tickAt("2026-11-03T10:00:00Z");
    const own: RunTrigger = {
      type: "schedule",
      routineId: "billing/thanks",
      at: "2026-11-03T10:00:00Z",
    };
    await send("own-1", "2026-11-03T10:00:30.000Z", ["Acme"], own);
    const result = await tickAt("2026-11-03T10:01:00Z");
    expect(result.started).toEqual([]);
    expect(await scheduler.skippedTimes("billing/thanks")).toMatchObject([
      { reason: "signal-loop", from: "2026-11-03T10:00:30.000Z", count: 1 },
    ]);
  });

  it("refuses the start when the store can't be read to follow the chain", async () => {
    const { executor, scheduler, tickAt, send } = setUp([onPaid("thanks")]);
    await tickAt("2026-11-03T10:00:00Z");
    await send("sender-1", "2026-11-03T10:00:30.000Z", ["Acme"]);
    executor.get = async () => {
      throw new Error("EIO: i/o error, read");
    };
    expect((await tickAt("2026-11-03T10:01:00Z")).started).toEqual([]);
    expect(await scheduler.skippedTimes("billing/thanks")).toMatchObject([
      { reason: "signal-loop", count: 1 },
    ]);
  });

  it("lets `skip` start one routine run however many signals one run sends", async () => {
    const { scheduler, tickAt, send } = setUp([onPaid("thanks", "skip")]);
    await tickAt("2026-11-03T10:00:00Z");
    await send("sender-1", "2026-11-03T10:00:30.000Z", ["A", "B", "C", "D", "E"]);
    const result = await tickAt("2026-11-03T10:01:00Z");
    expect(result.started).toHaveLength(1);
    expect(result.skipped).toHaveLength(4);
    expect(await scheduler.skippedTimes("billing/thanks")).toMatchObject([
      { reason: "busy", count: 1 },
    ]);
    expect((await tickAt("2026-11-03T10:02:00Z")).started).toEqual([]);
  });

  it("queues a signal while the routine is busy, and starts it once the run ends", async () => {
    const { executor, tickAt, send } = setUp([onPaid("thanks", "queue")]);
    await tickAt("2026-11-03T10:00:00Z");
    await send("sender-1", "2026-11-03T10:00:30.000Z", ["Acme", "Bolt"]);
    const first = await tickAt("2026-11-03T10:01:00Z");
    expect(first.started).toHaveLength(1);
    expect(first.queued).toEqual([{ key: "billing/thanks", at: "2026-11-03T10:00:30.000Z" }]);
    executor.end(first.started[0]?.id ?? "");
    const later = await tickAt("2026-11-03T10:30:00Z");
    expect(later.started.map((run) => run.trigger?.signalId)).toEqual(["sender-1:2"]);
    expect(executor.requests.at(-1)).toMatchObject({ input: { vendor: "Bolt" } });
  });

  it("starts a renamed routine once more only for a signal still in the window", async () => {
    const { list, tickAt, send } = setUp([onPaid("thanks")]);
    await tickAt("2026-11-03T10:00:00Z");
    await send("old-1", "2026-11-03T10:01:00.000Z", ["Old"]);
    await send("recent-1", "2026-11-03T10:04:30.000Z", ["Recent"]);
    expect((await tickAt("2026-11-03T10:05:00Z")).started).toHaveLength(2);
    list.routines = [onPaid("thank-vendors")];
    const result = await tickAt("2026-11-03T10:06:00Z");
    expect(result.started.map((run) => run.trigger?.signalId)).toEqual(["recent-1:1"]);
  });
});
