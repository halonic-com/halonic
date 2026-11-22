import type { RunEventBody } from "@halonicjs/events";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { RunHistory } from "./run-history.ts";
import { MemoryRuns } from "./testing/memory-runs.ts";

const started: RunEventBody = {
  type: "run.started",
  hubId: "acme",
  workflowId: "topics",
  input: {},
  kind: "run",
  definitionsVersion: "v1",
};

const childStarted: RunEventBody = { ...started, workflowId: "draft-one" };

/** The child of item `item` of the step Each failed; with no item, a `workflow` step's child. */
function itemFailed(item?: number): RunEventBody & { item?: number } {
  return {
    type: "workflow.finished",
    state: "each",
    workflow: "draft-one",
    childRunId: "run_topics.3.1",
    status: "failed",
    error: "Ollama isn't answering",
    ...(item === undefined ? {} : { item }),
  };
}

const failedInEach: RunEventBody = {
  type: "run.failed",
  state: "each",
  error: 'Workflow "draft-one" failed in item 1 of for-each state "each": boom',
};

const childFailed: RunEventBody = {
  type: "run.failed",
  state: "draft",
  error: "Ollama isn't answering",
  reason: "model-unreachable",
};

/** A store with the parent's log and its item 1's own log. */
function storeWith(parent: readonly RunEventBody[]): MemoryRuns {
  const store = new MemoryRuns();
  store.add("run_topics", "2026-11-22T10:00:00.000Z", parent);
  store.add("run_topics.3.1", "2026-11-22T10:00:02.000Z", [childStarted, childFailed]);
  return store;
}

async function failedChildOfParent(parent: readonly RunEventBody[]) {
  const history = new RunHistory(storeWith(parent));
  const lookup = await history.showRun("run_topics");
  if (lookup.found !== "one") throw new Error("Expected the parent run");
  return history.failedChild(lookup.run);
}

verifies("app.failed-child-run", () => {
  describe("RunHistory.failedChild", () => {
    it("gives the for-each item's child run that failed, with its log and item", async () => {
      const child = await failedChildOfParent([started, itemFailed(1), failedInEach]);

      expect(child?.item).toBe(1);
      expect(child?.run.summary).toMatchObject({ id: "run_topics.3.1", status: "failed" });
      expect(child?.run.events.at(-1)).toMatchObject({ reason: "model-unreachable" });
    });

    it("gives the child of a workflow step with no item", async () => {
      const child = await failedChildOfParent([started, itemFailed(), failedInEach]);

      expect(child?.item).toBeUndefined();
      expect(child?.run.summary.id).toBe("run_topics.3.1");
    });

    it("gives none for a run its budget stopped", async () => {
      const budget: RunEventBody = { ...failedInEach, reason: "budget" };

      expect(await failedChildOfParent([started, itemFailed(1), budget])).toBeUndefined();
    });

    it("gives none for a run that failed in another step than its child", async () => {
      const later: RunEventBody = { ...failedInEach, state: "publish" };

      expect(await failedChildOfParent([started, itemFailed(1), later])).toBeUndefined();
    });

    it("gives none when the child's log is gone", async () => {
      const gone = { ...itemFailed(2), childRunId: "run_topics.3.2" };

      expect(await failedChildOfParent([started, gone, failedInEach])).toBeUndefined();
    });
  });
});
