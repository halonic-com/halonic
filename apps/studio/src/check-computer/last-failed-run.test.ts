import { MemoryDefinitionStore } from "@halonicjs/adapter-memory";
import type { RunEvent, RunSummary } from "@halonicjs/events";
import type { RunsSource } from "@halonicjs/studio-feature-runs/api";
import { verifies } from "@halonicjs/testing-spec";
import { loadWorkspace } from "@halonicjs/workspace";
import { expect, it } from "vitest";
import { lastFailedRun } from "./last-failed-run.ts";

/** An invented workspace: one workflow of three steps and a final one. */
const workspace = () =>
  loadWorkspace(
    new MemoryDefinitionStore({
      "workspace.yaml": "id: acme\nname: Acme\n",
      "hubs/support/hub.yaml": "id: support\nname: Support\n",
      "hubs/support/agents/writer.agent.yaml":
        "id: writer\nname: Writer\ninstructions: Write short replies.\n",
      "hubs/support/workflows/reply.workflow.yaml": [
        "id: reply",
        "name: Reply",
        "initial: read",
        "states:",
        "  read:",
        "    description: Read the email",
        "    agent: writer",
        "    on: [{ to: draft }]",
        "  draft:",
        "    agent: writer",
        "    on: [{ to: review }]",
        "  review:",
        "    type: wait",
        "    on: [{ to: done, event: approve }]",
        "  done:",
        "    type: final",
      ].join("\n"),
    }),
  );

/** A summary with just what the Last run line reads; the rest of a summary doesn't matter here. */
function summary(changes: Partial<RunSummary>): RunSummary {
  return {
    id: "run_1",
    hubId: "support",
    workflowId: "reply",
    kind: "run",
    status: "failed",
    state: "draft",
    startedAt: "2026-11-19T10:44:00.000Z",
    endedAt: "2026-11-19T10:44:06.800Z",
    statesVisited: ["read", "draft"],
    ...changes,
  } as RunSummary;
}

const failedEvent = {
  runId: "run_1",
  seq: 9,
  at: "2026-11-19T10:44:06.800Z",
  type: "run.failed",
  state: "draft",
  error: "The run stopped.",
} as RunEvent;

/** The runs list, newest first, with each run's log. */
function runsOf(
  summaries: readonly RunSummary[],
  log: readonly RunEvent[] = [failedEvent],
): RunsSource {
  return {
    list: async () => summaries.map((each) => ({ summary: each })),
    log: async () => [...log],
  } as unknown as RunsSource;
}

verifies("studio.check-computer.source", () => {
  it("gives the last run that failed: its step of how many, the step's name, how long and its hub", async () => {
    const run = await lastFailedRun(runsOf([summary({})]), await workspace());

    expect(run).toMatchObject({
      runId: "run_1",
      hub: "support",
      step: 2,
      steps: 3,
      stepName: "Draft",
      durationMs: 6800,
    });
    expect(run?.failure).toBeDefined();
  });

  it("names a step by the first line of its description", async () => {
    const run = await lastFailedRun(
      runsOf([summary({ state: "read", statesVisited: ["read"] })]),
      await workspace(),
    );

    expect(run).toMatchObject({ step: 1, stepName: "Read the email" });
  });

  it("skips test runs, and gives none when the last run didn't fail", async () => {
    const test = summary({ id: "test_1", kind: "test" });
    const finished = summary({ status: "completed", state: "done" });

    expect(await lastFailedRun(runsOf([test, finished]), await workspace())).toBeUndefined();
    expect(await lastFailedRun(runsOf([summary({})], []), await workspace())).toBeUndefined();
  });
});
