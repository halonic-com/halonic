import type { Workflow } from "@halonicjs/format";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { KernelRuns, replyWorkflow } from "../kernel/kernel-test-kit.test-helper.ts";
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
});
