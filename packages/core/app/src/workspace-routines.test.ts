import { parseFile } from "@halonicjs/format";
import type { DefinitionStore } from "@halonicjs/ports";
import type { PlacedRoutine } from "@halonicjs/routines";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { lastTickKey, routineRunId } from "./routine-ids.ts";
import { TestCoordination } from "./testing/memory-coordination.ts";
import { TestDefinitionStore } from "./testing/memory-definition-store.ts";
import { TestExecutor } from "./testing/test-executor.ts";
import { workspaceRoutineScheduler } from "./workspace-routines.ts";

// Real routine files, read and checked by `@halonicjs/format`, run through
// the real tick function. Core may not use adapters, so the clock is a
// variable and the ports are the kernel's contract-checked fakes.

const morning = [
  "id: morning",
  "name: Morning digest",
  'trigger: { schedule: "0 8 * * *" }',
  "run:",
  "  workflow: digest",
  '  input: { day: "{{trigger.at}}", since: "{{trigger.lastRun}}" }',
].join("\n");

const inbox = [
  "id: inbox",
  "name: Inbox",
  "trigger: { every: 15m }",
  "catchUp: last",
  'run: { agent: clerk, prompt: "Check the mail due at {{trigger.at}}." }',
].join("\n");

const hourly = [
  "id: hourly",
  "name: Hourly totals",
  'trigger: { schedule: "0 * * * *" }',
  "catchUp: all",
  'run: { workflow: totals, input: { since: "{{trigger.lastRun}}" } }',
].join("\n");

/** Every routine file of the workspace, each with the hub it lives in. */
async function readRoutines(store: DefinitionStore): Promise<PlacedRoutine[]> {
  const placed: PlacedRoutine[] = [];
  for (const path of await store.list()) {
    const match = /^(?:hubs\/([^/]+)\/)?workflows\/routines\/([^/]+)\.routine\.yaml$/.exec(path);
    const text = await store.read(path);
    if (match?.[2] === undefined || text === null) {
      continue;
    }
    const parsed = parseFile("routine", text, { id: match[2] });
    if (!parsed.ok) {
      throw new Error(`${path}: ${parsed.error.map((problem) => problem.message).join("; ")}`);
    }
    placed.push({ hub: match[1] ?? null, routine: parsed.value.value });
  }
  return placed;
}

const workspace = "ws-5d81e0";

function setUp(files: Record<string, string>, start: string) {
  let now = Date.parse(start);
  const coordination = new TestCoordination();
  const executor = new TestExecutor();
  const store = new TestDefinitionStore(files);
  const scheduler = workspaceRoutineScheduler({
    workspaceId: workspace,
    clock: { now: () => new Date(now) },
    coordination,
    executor,
    routines: () => readRoutines(store),
  });
  const tickAt = (iso: string) => {
    now = Date.parse(iso);
    return scheduler.tick();
  };
  return { coordination, executor, tickAt };
}

const runId = (key: string, at: string) => routineRunId(workspace, key, new Date(at));

verifies("app.workspace-routines", () => {
  it("starts a schedule and an every routine with their placeholders filled", async () => {
    const { executor, tickAt } = setUp(
      {
        "hubs/news/workflows/routines/morning.routine.yaml": morning,
        "hubs/news/workflows/routines/inbox.routine.yaml": inbox,
      },
      "2026-11-03T07:30:00Z",
    );
    await tickAt("2026-11-03T07:30:00Z");
    await tickAt("2026-11-03T08:00:20Z");
    expect(executor.requests).toEqual([
      {
        hubId: "news",
        agentId: "clerk",
        prompt: "Check the mail due at 2026-11-03T08:00:00.000Z.",
        trigger: { type: "every", routineId: "news/inbox", at: "2026-11-03T08:00:00.000Z" },
        runId: runId("news/inbox", "2026-11-03T08:00:00Z"),
      },
      {
        hubId: "news",
        workflowId: "digest",
        input: { day: "2026-11-03T08:00:00.000Z", since: null },
        trigger: { type: "schedule", routineId: "news/morning", at: "2026-11-03T08:00:00.000Z" },
        runId: runId("news/morning", "2026-11-03T08:00:00Z"),
      },
    ]);
    executor.requests.length = 0;
    await tickAt("2026-11-04T08:00:20Z");
    expect(executor.requests.at(-1)).toMatchObject({
      workflowId: "digest",
      input: { day: "2026-11-04T08:00:00.000Z", since: "2026-11-03T08:00:00.000Z" },
    });
  });

  it("catches up on missed ticks as each routine's catchUp says", async () => {
    const { tickAt, executor } = setUp(
      {
        "hubs/shop/workflows/routines/hourly.routine.yaml": hourly,
        "hubs/shop/workflows/routines/inbox.routine.yaml": inbox,
      },
      "2026-11-03T07:59:00Z",
    );
    await tickAt("2026-11-03T07:59:00Z");
    const { started } = await tickAt("2026-11-03T10:40:00Z");
    expect(started.map((run) => [run.trigger?.routineId, run.trigger?.at])).toEqual([
      ["shop/hourly", "2026-11-03T08:00:00.000Z"],
      ["shop/hourly", "2026-11-03T09:00:00.000Z"],
      ["shop/hourly", "2026-11-03T10:00:00.000Z"],
      ["shop/inbox", "2026-11-03T10:30:00.000Z"],
    ]);
    const since = executor.requests.flatMap((request) =>
      "input" in request ? [request.input["since"]] : [],
    );
    expect(since).toEqual([null, "2026-11-03T08:00:00.000Z", "2026-11-03T09:00:00.000Z"]);
  });

  it("starts nothing on a second tick at the same time, and repeats a start with the same run id", async () => {
    const { coordination, executor, tickAt } = setUp(
      { "hubs/news/workflows/routines/morning.routine.yaml": morning },
      "2026-11-03T07:30:00Z",
    );
    await tickAt("2026-11-03T07:30:00Z");
    const first = await tickAt("2026-11-03T08:00:20Z");
    expect((await tickAt("2026-11-03T08:00:20Z")).started).toEqual([]);
    // As if the host stopped before it stored the last tick.
    const key = lastTickKey(workspace);
    await coordination.compareAndSet(key, "2026-11-03T08:00:20.000Z", "2026-11-03T07:30:00.000Z");
    const again = await tickAt("2026-11-03T08:00:20Z");
    expect(again.started.map((run) => run.id)).toEqual(first.started.map((run) => run.id));
    expect([executor.requests.length, executor.runs.size]).toEqual([2, 1]);
  });

  it("reports a workspace routine that names no hub, and starts the others", async () => {
    const cleanup = "id: cleanup\nname: Clean up\ntrigger: { every: 1h }\nrun: { workflow: tidy }";
    const archive =
      "id: archive\nname: Archive\ntrigger: { every: 1h }\nrun: { hub: news, workflow: archive }";
    const { tickAt } = setUp(
      {
        "workflows/routines/cleanup.routine.yaml": cleanup,
        "workflows/routines/archive.routine.yaml": archive,
      },
      "2026-11-03T07:30:00Z",
    );
    await tickAt("2026-11-03T07:30:00Z");
    const { started, failed } = await tickAt("2026-11-03T08:00:20Z");
    expect(started.map((run) => [run.hubId, run.workflowId])).toEqual([["news", "archive"]]);
    expect(failed.map((failure) => [failure.key, failure.error.message])).toEqual([
      [
        "@workspace/cleanup",
        "Routine @workspace/cleanup runs outside a hub, so it must name one in run.hub.",
      ],
    ]);
  });
});
