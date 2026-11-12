// A run's own model calls write their turn to the run's log, so the run's
// summary counts what they cost and the budget sees it (HAL-5206).

import type { Agent, Workflow } from "@halonicjs/format";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { halonicTool } from "../agent/turn-test-kit.test-helper.ts";
import { KernelRuns, replyWorkflow, writerAgent } from "../kernel/kernel-test-kit.test-helper.ts";
import { call, callAnswer, textAnswer } from "../testing/scripted-model.ts";
import { maxLoggedResultBytes } from "../tools/large-results.ts";
import { replyStart, runsOn, typesOf } from "./local-runs-test-kit.test-helper.ts";

/** 10 input and 5 output tokens, as every scripted answer uses, cost 0.6 at this price. */
const price = { input: 40_000, output: 40_000 };

const answers = [textAnswer("Dear support"), textAnswer("Dear support, thanks")];

/** The writer drafts a reply, then polishes it: two model calls. */
const draftTwice: Workflow = {
  ...replyWorkflow,
  id: "draft-twice",
  states: {
    ...replyWorkflow.states,
    draft: {
      type: "task",
      agent: "writer",
      input: "Reply",
      output: "reply",
      on: [{ to: "polish", event: "done" }],
    },
    polish: {
      type: "task",
      agent: "writer",
      input: "Polish {{context.reply}}",
      output: "reply",
      on: [{ to: "sent", event: "done" }],
    },
  },
};

/** Runs the reply workflow to its end on the given answers and setup. */
async function runReply(...args: Parameters<typeof runsOn>) {
  const setup = runsOn(...args);
  await setup.executor.start(replyStart);
  await setup.scheduler.runDue();
  return setup;
}

/** The events the state's model call wrote: those between its `agent.started` and its `agent.finished`. */
function turnOf(runs: KernelRuns) {
  const events = runs.logs.get("run_1") ?? [];
  const start = events.findIndex((event) => event.type === "agent.started");
  const end = events.findIndex(
    (event) => event.type === "agent.finished" && event.parent === undefined,
  );
  return events.slice(start + 1, end);
}

verifies("engine.run-turn-log", () => {
  it("logs the model call with its cost, so the run's summary counts it", async () => {
    const { runs } = await runReply([textAnswer("Dear support")], new KernelRuns(), { price });

    expect(typesOf(turnOf(runs))).toEqual(["llm.request", "llm.response"]);
    expect(turnOf(runs)[1]).toMatchObject({ agent: "writer", cost: 0.6 });
    const summary = await runs.get("run_1");
    expect(summary).toMatchObject({
      status: "completed",
      usage: { inputTokens: 10, outputTokens: 5 },
    });
    expect(summary?.cost).toBeCloseTo(0.6);
  });

  it("stops the run at its next model call once its own calls reach the run budget", async () => {
    const budget = { currency: "EUR", perRun: 0.5 };
    const { executor, model, runs, scheduler } = runsOn(answers, new KernelRuns(), {
      workflow: draftTwice,
      budget,
      price,
    });
    await executor.start({ hubId: "acme", workflowId: "draft-twice", input: {} });
    await scheduler.runDue();

    expect(await runs.get("run_1")).toMatchObject({
      status: "failed",
      state: "polish",
      reason: "budget",
      error: "Run budget reached: 0.60 of 0.50 EUR spent.",
    });
    expect(model.requests).toHaveLength(1);
  });

  it("logs the tools the call runs", async () => {
    const lookup = halonicTool("lookup", async () => "found");
    const { runs } = await runReply(
      [callAnswer(call("c1", "lookup")), textAnswer("Dear support")],
      new KernelRuns(),
      { halonicTools: [lookup] },
    );

    expect(typesOf(turnOf(runs))).toEqual([
      "llm.request",
      "llm.response",
      "tool.called",
      "tool.result",
      "llm.request",
      "llm.response",
    ]);
    expect(turnOf(runs)[3]).toMatchObject({ agent: "writer", tool: "lookup", result: "found" });
  });

  it("keeps a large tool result in the blob store", async () => {
    const large = "x".repeat(maxLoggedResultBytes + 1);
    const lookup = halonicTool("lookup", async () => large);
    const { runs, blobs } = await runReply(
      [callAnswer(call("c1", "lookup")), textAnswer("Dear support")],
      new KernelRuns(),
      { halonicTools: [lookup] },
    );

    const result = turnOf(runs).find((event) => event.type === "tool.result");
    expect(result).toMatchObject({ resultBlob: { size: large.length } });
    expect(blobs.blobs.size).toBeGreaterThan(1);
  });

  it("logs a subagent's turn under the call that delegated to it, with its cost", async () => {
    const agents: Record<string, Agent> = {
      writer: { ...writerAgent(), subagents: ["checker"] },
      checker: { ...writerAgent(), id: "checker", name: "checker" },
    };
    const delegate = callAnswer(call("d-1", "delegate_checker", { task: "Check the tone" }));
    const { runs } = await runReply(
      [delegate, textAnswer("Friendly"), textAnswer("Dear support")],
      new KernelRuns(),
      { agents, price },
    );

    expect(typesOf(turnOf(runs))).toEqual([
      "llm.request",
      "llm.response",
      "tool.called",
      "agent.started",
      "llm.request",
      "llm.response",
      "agent.finished",
      "tool.result",
      "llm.request",
      "llm.response",
    ]);
    expect(turnOf(runs)[3]).toMatchObject({ agent: "checker", parent: "writer" });
    expect(turnOf(runs)[5]).toMatchObject({ agent: "checker", cost: 0.6 });
    const summary = await runs.get("run_1");
    expect(summary).toMatchObject({
      status: "completed",
      usage: { inputTokens: 30, outputTokens: 15 },
    });
    expect(summary?.cost).toBeCloseTo(1.8);
  });

  it("logs each foreach item's call in its item", async () => {
    const label: Workflow = {
      ...replyWorkflow,
      id: "label",
      initial: "label",
      states: {
        label: {
          type: "foreach",
          agent: "writer",
          items: "{{input.emails}}",
          as: "email",
          concurrency: 2,
          input: "Label {{email}}",
          output: "labels",
          on: [{ to: "sent", event: "done" }],
        },
        sent: { type: "final", on: [] },
      },
    };
    const { executor, runs, scheduler } = runsOn(answers, new KernelRuns(), {
      workflow: label,
      price,
    });
    await executor.start({ hubId: "acme", workflowId: "label", input: { emails: ["A", "B"] } });
    await scheduler.runDue();

    const responses = (runs.logs.get("run_1") ?? []).filter(
      (event) => event.type === "llm.response",
    );
    expect(responses.map((event) => event.item).sort()).toEqual([0, 1]);
    expect((await runs.get("run_1"))?.cost).toBeCloseTo(1.2);
  });
});
