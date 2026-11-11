import type { Workflow } from "@halonicjs/format";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import {
  approvalWorkflow,
  KernelRuns,
  replyWorkflow,
} from "../kernel/kernel-test-kit.test-helper.ts";
import { textAnswer } from "../testing/scripted-model.ts";
import { runsOn } from "./local-runs-test-kit.test-helper.ts";

/** Labels each email, two at a time. */
const triage: Workflow = {
  version: 1,
  id: "triage",
  name: "Triage the inbox",
  initial: "triage",
  context: {},
  states: {
    triage: {
      type: "foreach",
      agent: "labeler",
      items: "{{input.emails}}",
      as: "email",
      concurrency: 2,
      input: "Label {{email}}",
      output: "labels",
      on: [{ to: "filed", event: "done" }],
    },
    filed: { type: "final", on: [] },
  },
  layout: {},
};

verifies("engine.foreach-state", () => {
  it("carries out each item's call from its timer, then completes with the results", async () => {
    const answers = [textAnswer("refunds"), textAnswer("billing"), textAnswer("other")];
    const { executor, model, runs, scheduler } = runsOn(answers, new KernelRuns(), {
      workflow: triage,
    });

    await executor.start({
      hubId: "acme",
      workflowId: "triage",
      input: { emails: ["Refund", "Invoice", "Hello"] },
    });
    expect([...scheduler.timers.values()].map((timer) => timer.timerId)).toEqual([
      "call:call-1",
      "call:call-2",
    ]);
    await scheduler.runDue();

    expect(model.requests.map((request) => request.messages)).toEqual([
      [{ role: "user", content: "Label Refund" }],
      [{ role: "user", content: "Label Invoice" }],
      [{ role: "user", content: "Label Hello" }],
    ]);
    expect(await runs.get("run_1")).toMatchObject({
      status: "completed",
      context: { labels: ["refunds", "billing", "other"] },
    });
  });
});

verifies("engine.foreach-workflow-items", () => {
  it("runs a child run per item, each to its end, then completes with their contexts", async () => {
    const greet: Workflow = {
      ...triage,
      id: "greet",
      states: {
        ...triage.states,
        triage: {
          type: "foreach",
          workflow: "reply",
          items: "{{input.customers}}",
          as: "from",
          concurrency: 2,
          output: "replies",
          on: [{ to: "filed", event: "done" }],
        },
      },
    };
    const answers = [textAnswer("Hi Acme"), textAnswer("Hi Globex")];
    const { executor, model, runs, scheduler } = runsOn(answers, new KernelRuns(), {
      workflow: greet,
      workflows: { reply: replyWorkflow },
    });

    await executor.start({
      hubId: "acme",
      workflowId: "greet",
      input: { customers: ["Acme", "Globex"] },
    });
    await scheduler.runDue();

    expect(model.requests.map((request) => request.messages[0]?.content)).toEqual([
      "Reply to Acme",
      "Reply to Globex",
    ]);
    expect(await runs.get("run_1.2.1")).toMatchObject({ status: "completed" });
    expect(await runs.get("run_1")).toMatchObject({
      status: "completed",
      context: { replies: [{ reply: "Hi Acme" }, { reply: "Hi Globex" }] },
    });
  });

  it("cancels every item's child run when one waits, so none is left waiting", async () => {
    const { executor, runs, scheduler } = runsOn([textAnswer("Hi Acme")], new KernelRuns(), {
      workflow: greetEach("review"),
      workflows: { review },
    });

    await executor.start({
      hubId: "acme",
      workflowId: "greet",
      input: { customers: ["Acme", "Globex"] },
    });
    // Only item 0's call is carried out: its child waits while item 1's still runs.
    await scheduler.deliver("run_1.2.0", "call:call-1");

    expect(await runs.get("run_1")).toMatchObject({
      status: "failed",
      error:
        'Workflow "review" in item 0 of for-each state "triage" waits for approve; an item\'s child run must finish without waiting.',
    });
    for (const child of ["run_1.2.0", "run_1.2.1"]) {
      expect(await runs.get(child)).toMatchObject({ status: "failed", reason: "cancelled" });
    }
    await scheduler.runDue();
    expect(await runs.get("run_1.2.1")).toMatchObject({ status: "failed", reason: "cancelled" });
  });

  it("starts no item's child run after one that started in the same step waits", async () => {
    const { executor, runs } = runsOn([], new KernelRuns(), {
      workflow: greetEach("approve"),
      workflows: { approve: approvalWorkflow() },
    });

    await executor.start({
      hubId: "acme",
      workflowId: "greet",
      input: { customers: ["Acme", "Globex"] },
    });

    expect(await runs.get("run_1")).toMatchObject({ status: "failed" });
    expect(await runs.get("run_1.2.0")).toMatchObject({ status: "failed", reason: "cancelled" });
    expect(await runs.get("run_1.2.1")).toBeNull();
  });
});

/** A reply drafted, then a person approves it. */
const review: Workflow = {
  ...replyWorkflow,
  id: "review",
  states: {
    ...replyWorkflow.states,
    draft: {
      type: "task",
      agent: "writer",
      input: "Reply to {{input.from}}",
      on: [{ to: "decide", event: "done" }],
    },
    decide: { type: "wait", on: [{ to: "sent", event: "approve" }] },
  },
};

/** Runs `workflow` once per customer, two at a time. */
function greetEach(workflow: string): Workflow {
  return {
    ...triage,
    id: "greet",
    states: {
      ...triage.states,
      triage: {
        type: "foreach",
        workflow,
        items: "{{input.customers}}",
        as: "from",
        concurrency: 2,
        on: [{ to: "filed", event: "done" }],
      },
    },
  };
}
