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
        'For-each step "each" runs "review-one" once for each item, and a run for one item can\'t wait, but "review-one" has the wait step "approve". Move "approve" into this workflow after "each", or take it out of "review-one".',
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

/** Review one, whose step `check` runs Sign-off. */
const reviewOneRunsSignOff = [
  "name: Review one",
  "initial: check",
  "states:",
  "  check: { type: workflow, workflow: sign-off, on: [{ to: done }] }",
  "  done: { type: final }",
  "",
].join("\n");

/** Sign-off: the step `approve` waits for approve. */
const signOffWaiting = [
  "name: Sign-off",
  "initial: approve",
  "states:",
  "  approve: { type: wait, on: [{ event: approve, to: done }] }",
  "  done: { type: final }",
  "",
].join("\n");

/** Sign-off, which runs Review one back and never waits. */
const signOffRunsReviewOne = [
  "name: Sign-off",
  "initial: again",
  "states:",
  "  again: { type: workflow, workflow: review-one, on: [{ to: done }] }",
  "  done: { type: final }",
  "",
].join("\n");

/** Sign-off, whose step `ask` runs Ask. */
const signOffRunsAsk = [
  "name: Sign-off",
  "initial: ask",
  "states:",
  "  ask: { type: workflow, workflow: ask, on: [{ to: done }] }",
  "  done: { type: final }",
  "",
].join("\n");

verifies("workspace.foreach-nested-waits", () => {
  it("refuses a for-each step whose workflow runs a workflow with a wait step", async () => {
    expect(
      await issuesOf({
        "hubs/support/workflows/topics.workflow.yaml": topics,
        "hubs/support/workflows/review-one.workflow.yaml": reviewOneRunsSignOff,
        "hubs/support/workflows/sign-off.workflow.yaml": signOffWaiting,
      }),
    ).toEqual([
      [
        "error",
        "foreach-child-waits",
        "hubs/support/workflows/topics.workflow.yaml",
        "states.each.workflow",
        `For-each step "each" runs "review-one" once for each item, and a run for one item can't wait, but "review-one" runs "sign-off", which has the wait step "approve". Move "approve" into this workflow after "each", or take it out of "sign-off".`,
      ],
    ]);
  });

  it("names each workflow on the way to a wait step further down", async () => {
    const { issues } = await acme({
      "hubs/support/workflows/topics.workflow.yaml": topics,
      "hubs/support/workflows/review-one.workflow.yaml": reviewOneRunsSignOff,
      "hubs/support/workflows/sign-off.workflow.yaml": signOffRunsAsk,
      "hubs/support/workflows/ask.workflow.yaml": signOffWaiting.replace("Sign-off", "Ask"),
    });

    expect(issues.map((issue) => issue.message)).toEqual([
      `For-each step "each" runs "review-one" once for each item, and a run for one item can't wait, but "review-one" runs "sign-off", which runs "ask", which has the wait step "approve". Move "approve" into this workflow after "each", or take it out of "ask".`,
    ]);
  });

  it("follows workflows that run each other once, and adds nothing to the loop's own error", async () => {
    const issues = await issuesOf({
      "hubs/support/workflows/topics.workflow.yaml": topics,
      "hubs/support/workflows/review-one.workflow.yaml": reviewOneRunsSignOff,
      "hubs/support/workflows/sign-off.workflow.yaml": signOffRunsReviewOne,
    });

    expect(issues.map(([, code]) => code)).toEqual(["subflow-loop"]);
  });
});
