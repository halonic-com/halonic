import type { RunEvent, RunSummary } from "@halonicjs/events";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { summaryWith } from "../summary.test-helper.ts";
import { childFailureBanner, type FailedChildView } from "./child-failure-banner.ts";
import { call, context } from "./failure-banner.test-helper.ts";
import type { RunPageContext } from "./run-page-model.ts";

const topics: RunPageContext = {
  ...context,
  workflow: { name: "Topics", stepDescription: () => undefined },
};

const parent = summaryWith({
  id: "run_topics_a1b2c3",
  workflowId: "topics",
  status: "failed",
  reason: "error",
  state: "each",
  statesVisited: ["each"],
  error: 'Workflow "draft-one" failed in item 0 of for-each state "each": boom',
});

const childId = "run_topics_a1b2c3.4.1";

/** The child run of Draft one, failed in its step Draft with `changes`. */
function child(
  changes: Partial<RunSummary>,
  item: number | undefined,
  log: readonly RunEvent[] = [],
): FailedChildView {
  return {
    item,
    summary: summaryWith({
      id: childId,
      workflowId: "draft-one",
      status: "failed",
      state: "draft",
      error: "engine text",
      parentRunId: parent.id,
      ...changes,
    }),
    log,
    context: { ...context, workflow: { name: "Draft one", stepDescription: () => undefined } },
  };
}

const itemsNotAList = child(
  {
    reason: "error",
    cause: {
      kind: "not_found",
      code: "workflow.items-not-a-list",
      detail: { items: "{{input.topics}}", gives: "text" },
    },
  },
  0,
);

const callout = (banner: ReturnType<typeof childFailureBanner>) =>
  banner?.kind === "callout" ? banner : undefined;

verifies("runs.run-view.failed-child-run", () => {
  it("leads the child's cause with the parent's step and the item, counted from 1", () => {
    const banner = callout(childFailureBanner(parent, topics, itemsNotAList, false));
    expect(banner?.lines).toEqual([
      "Topics failed in the step Each because the run it started for item 1 failed in the step Draft: its items ({{input.topics}}) are a text, not a list.",
      'Pass a JSON list, such as ["Monday", "Tuesday"].',
    ]);
    expect(banner?.tone).toBe("danger");
  });

  it("opens the child run, and leaves out See the step, which would open the parent's step", () => {
    const banner = callout(childFailureBanner(parent, topics, itemsNotAList, false));
    expect(banner?.action).toEqual({
      kind: "open-run",
      runId: childId,
      label: "Open run a1b2c3.4.1",
    });
    expect(banner?.fixes).toEqual([]);
    expect(banner?.links).toEqual([]);
  });

  it("says the run it started for a workflow step, and the general line for a cause it can't name", () => {
    const review = { ...parent, state: "review", statesVisited: ["review"] };
    const banner = callout(
      childFailureBanner(review, topics, child({ reason: "error" }, undefined), false),
    );
    expect(banner?.lines).toEqual([
      "Topics failed in the step Review because the run it started failed in the step Draft. Halonic can't tell the cause yet.",
    ]);
  });

  it("copies the child's details and the parent's run id", () => {
    const banner = callout(
      childFailureBanner(parent, topics, child({ reason: "error" }, 0), false),
    );
    expect(banner?.details).toBe(
      [
        "Topics failed in the step Each because the run it started for item 1 failed in the step Draft. Halonic can't tell the cause yet.",
        `Run ${childId}`,
        "engine text",
        `Started by run ${parent.id}`,
      ].join("\n"),
    );
  });

  it("puts a line naming both steps before a child line that doesn't name its workflow", () => {
    const outOfMemory = child({ reason: "model-out-of-memory" }, 1, [
      call("ollama", "llama3.1:70b"),
    ]);
    const banner = callout(childFailureBanner(parent, topics, outOfMemory, false));
    expect(banner?.lines).toEqual([
      "Topics failed in the step Each because the run it started for item 2 failed in the step Draft.",
      "Ollama couldn't load llama3.1:70b: this computer doesn't have enough free memory for it.",
      "Close other programs, or pick a smaller model in Models.",
    ]);
    expect(banner?.fixes).toEqual([{ kind: "open-models" }]);
  });

  it("follows one level of child run: a child that failed in its own child says it can't tell why", () => {
    const failedInItsChild = child(
      {
        reason: "error",
        state: "each",
        statesVisited: ["each"],
        error: 'Workflow "polish" failed in item 0 of for-each state "each": boom',
      },
      0,
    );
    const banner = callout(childFailureBanner(parent, topics, failedInItsChild, false));
    expect(banner?.lines).toEqual([
      "Topics failed in the step Each because the run it started for item 1 failed in the step Each. Halonic can't tell the cause yet.",
    ]);
    expect(banner?.action).toEqual({
      kind: "open-run",
      runId: childId,
      label: "Open run a1b2c3.4.1",
    });
  });

  it("leaves the parent's own banner for a child that was cancelled", () => {
    const cancelled = child({ reason: "cancelled" }, 0);
    expect(childFailureBanner(parent, topics, cancelled, false)).toBeUndefined();
  });
});
