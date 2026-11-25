import type { WorkspaceSnapshot } from "@halonicjs/format";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, test } from "vitest";
import { acmeSnapshot, acmeTool, fakeHost, runCtx } from "../fake-host.test-helper.ts";
import { runtimeHandlers } from "../handlers.ts";
import type { PaperclipEvent, ToolDeclaration } from "../host.ts";
import { registerWorkspaceTools } from "../register.ts";
import {
  type FailedRun,
  failedRunsKey,
  readRecord,
  recordFailure,
  recordLimits,
} from "./failed-runs-record.ts";

const now = new Date("2026-11-24T12:00:00Z");

const declarations: ToolDeclaration[] = [
  {
    name: "failed_runs",
    displayName: "Failed runs",
    description: "Acme's failed runs.",
    parametersSchema: { type: "object", properties: { since: { type: "string" } } },
  },
];

/** The acme snapshot with `failed_runs` listing the last `hours`. */
function snapshotWithFailedRuns(hours = 24): WorkspaceSnapshot {
  const failedRuns = acmeTool("failed_runs", {
    action: { run: "paperclip.failed-runs", with: { hours } },
  });
  return acmeSnapshot({ tools: [failedRuns] });
}

/** A worker serving `failed_runs` from its built-in snapshot. */
function worker(builtIn = snapshotWithFailedRuns()) {
  const host = fakeHost({}, {});
  registerWorkspaceTools(host.ctx, {
    declarations,
    builtIn,
    handlers: runtimeHandlers,
    now: () => now,
  });
  return host;
}

/** An `agent.run.failed` event as Paperclip sends it, error text included. */
function failedEvent(runId: string, payload: Record<string, unknown> = {}): PaperclipEvent {
  return {
    eventType: "agent.run.failed",
    occurredAt: "2026-11-24T11:00:00Z",
    companyId: runCtx.companyId,
    payload: {
      runId,
      agentId: "agent-mateo",
      issueId: "task-7",
      status: "failed",
      error: "No managed GitHub identity is available for token ghp_secret",
      ...payload,
    },
  };
}

function run(runId: string, at: string): FailedRun {
  return { runId, agentId: "agent-mateo", taskId: null, cause: "other", at };
}

verifies("runtime.paperclip-failed-runs", () => {
  describe("paperclip.failed-runs", () => {
    test("answers as failed_runs does with a run the worker kept from an agent.run.failed event", async () => {
      const { call, deliver, saved } = worker();
      await deliver(failedEvent("run-1"));
      await deliver(failedEvent("run-2", { status: "timed_out", issueId: undefined }));
      const result = await call("failed_runs", {});
      expect(result.content?.split("\n")).toEqual([
        "Failed and timed-out runs since 2026-11-23T12:00:00.000Z: 2. Counting since 2026-11-24T11:00:00.000Z; runs that failed while the plugin was down are missing.",
        "- Mateo: 2 (no_identity 1, timeout 1) on ACME-7",
      ]);
      expect(result.data).toMatchObject({
        countingSince: "2026-11-24T11:00:00.000Z",
        runs: [
          { runId: "run-1", cause: "no_identity", task: "ACME-7" },
          { runId: "run-2", cause: "timeout", task: null },
        ],
      });
      // The error text was sorted into a cause code and dropped.
      expect(JSON.stringify([...saved.values()])).not.toContain("ghp_secret");
    });

    test("keeps each run once and takes `since` from the agent, or the tool's hours", async () => {
      const { call, deliver } = worker(snapshotWithFailedRuns(1));
      await deliver(failedEvent("run-1"));
      await deliver(failedEvent("run-1"));
      expect((await call("failed_runs", {})).content).toContain(
        "since 2026-11-24T11:00:00.000Z: 1.",
      );
      expect((await call("failed_runs", { since: "2026-11-24T11:30:00Z" })).content).toContain(
        ": 0. Counting since 2026-11-24T11:00:00.000Z",
      );
    });

    test("refuses a `since` that isn't a time, and says when it has seen no failed run", async () => {
      const { call } = worker();
      expect(await call("failed_runs", { since: "yesterday" })).toEqual({
        error: "failed_runs: since must be an ISO time, such as 2026-11-22T12:00:00Z.",
      });
      expect((await call("failed_runs", {})).content).toContain(
        "Counting since no failed run seen yet;",
      );
    });

    test("skips an event without a run or an agent", async () => {
      const { deliver, saved } = worker();
      await deliver(failedEvent("", { agentId: undefined }));
      expect(saved.get(JSON.stringify(failedRunsKey(runCtx.companyId)))).toBeUndefined();
    });

    test("subscribes to agent.run.failed only when a built-in tool lists failed runs", () => {
      expect(worker().subscribed.has("agent.run.failed")).toBe(true);
      expect(worker(acmeSnapshot()).subscribed.has("agent.run.failed")).toBe(false);
    });

    test("keeps the record within a week and its newest 500 runs", () => {
      const weekAgo = new Date(now.getTime() - recordLimits.keepMs - 1).toISOString();
      let record = recordFailure(readRecord(null), run("old", weekAgo), now);
      for (let index = 0; index <= recordLimits.maxRuns; index += 1) {
        const at = new Date(now.getTime() - (recordLimits.maxRuns - index) * 1000).toISOString();
        record = recordFailure(record, run(`run-${index}`, at), now);
      }
      expect(record.runs).toHaveLength(recordLimits.maxRuns);
      expect(record.runs[0]?.runId).toBe("run-1");
      expect(record.runs.at(-1)?.runId).toBe(`run-${recordLimits.maxRuns}`);
      expect(record.since).toBe(weekAgo);
    });

    test("asks Paperclip only to subscribe to events, read tasks and list agents", () => {
      expect(runtimeHandlers["paperclip.failed-runs"]?.capabilities).toEqual([
        "events.subscribe",
        "issues.read",
        "agents.read",
      ]);
    });
  });
});
