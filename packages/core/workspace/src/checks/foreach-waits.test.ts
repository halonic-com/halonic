import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { errorsStoppingRun, loadWorkspace } from "../index.ts";
import { MemorySource } from "../test/memory-source.ts";

/** Acme's Topics workflow: a for-each step `each` runs `review-one` for every topic. */
const topics = [
  "name: Topics",
  "initial: each",
  "states:",
  '  each: { type: foreach, items: "{{input.topics}}", workflow: review-one, on: [{ to: done }] }',
  "  done: { type: final }",
  "",
].join("\n");

/** Review one: Writer drafts, then the step `approve` waits for approve or reject. */
const reviewOneWaiting = [
  "name: Review one",
  "initial: draft",
  "states:",
  "  draft: { agent: writer, on: [{ to: approve }] }",
  "  approve: { type: wait, on: [{ event: approve, to: done }, { event: reject, to: done }] }",
  "  done: { type: final }",
  "",
].join("\n");

const reviewOneDone = [
  "name: Review one",
  "initial: draft",
  "states:",
  "  draft: { agent: writer, on: [{ to: done }] }",
  "  done: { type: final }",
  "",
].join("\n");

const acme = (files: Record<string, string>) =>
  loadWorkspace(
    new MemorySource({
      "workspace.yaml": "id: acme\nname: Acme\n",
      "hubs/support/hub.yaml": "name: Support\n",
      "hubs/support/agents/writer.agent.yaml": "name: Writer\n",
      ...files,
    }),
  );

const issuesOf = async (files: Record<string, string>) =>
  (await acme(files)).issues.map((issue) => [
    issue.severity,
    issue.code,
    issue.file,
    issue.path.join("."),
    issue.message,
  ]);

verifies("workspace.foreach-child-waits", () => {
  it("refuses a for-each step whose workflow has a wait step, at its workflow", async () => {
    expect(
      await issuesOf({
        "hubs/support/workflows/topics.workflow.yaml": topics,
        "hubs/support/workflows/review-one.workflow.yaml": reviewOneWaiting,
      }),
    ).toEqual([
      [
        "error",
        "foreach-child-waits",
        "hubs/support/workflows/topics.workflow.yaml",
        "states.each.workflow",
        'For-each step "each" runs "review-one" for each item, but "review-one" has the wait step "approve", and an item\'s run can\'t wait, so the run fails there. Move the wait step after "each", or take it out of "review-one".',
      ],
    ]);
  });

  it("stops a run of the for-each's workflow, and not one of the waiting workflow", async () => {
    const workspace = await acme({
      "hubs/support/workflows/topics.workflow.yaml": topics,
      "hubs/support/workflows/review-one.workflow.yaml": reviewOneWaiting,
    });
    const stopping = (workflowId: string) =>
      errorsStoppingRun(workspace, workspace.issues, { hubId: "support", workflowId }).map(
        (issue) => issue.code,
      );
    expect(stopping("topics")).toEqual(["foreach-child-waits"]);
    expect(stopping("review-one")).toEqual([]);
  });

  it("reports nothing when the item's workflow has no wait step", async () => {
    expect(
      await issuesOf({
        "hubs/support/workflows/topics.workflow.yaml": topics,
        "hubs/support/workflows/review-one.workflow.yaml": reviewOneDone,
      }),
    ).toEqual([]);
  });

  it("leaves a workflow step that runs a waiting workflow alone: that run waits with it", async () => {
    const once = topics.replace(
      '{ type: foreach, items: "{{input.topics}}", workflow: review-one,',
      "{ type: workflow, workflow: review-one,",
    );
    expect(
      await issuesOf({
        "hubs/support/workflows/topics.workflow.yaml": once,
        "hubs/support/workflows/review-one.workflow.yaml": reviewOneWaiting,
      }),
    ).toEqual([]);
  });

  it("looks only in the for-each's own hub, as for its other names", async () => {
    const codes = (
      await acme({
        "hubs/support/workflows/topics.workflow.yaml": topics,
        "hubs/billing/hub.yaml": "name: Billing\n",
        "hubs/billing/agents/writer.agent.yaml": "name: Writer\n",
        "hubs/billing/workflows/review-one.workflow.yaml": reviewOneWaiting,
      })
    ).issues.map((issue) => issue.code);
    expect(codes).toEqual(["unknown-workflow"]);
  });
});
