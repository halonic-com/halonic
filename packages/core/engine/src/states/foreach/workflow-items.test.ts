import type { Workflow, WorkflowState } from "@halonicjs/format";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import type { ChildInput, ChildRunNow, StartInput } from "../../kernel/decide-types.ts";
import { play, replyWorkflow, startInput } from "../../kernel/kernel-test-kit.test-helper.ts";
import { maxChildDepth } from "../workflow/state.ts";

/** Runs the reply workflow for each customer of the run's input, two at a time. */
function greetWorkflow(greet: Partial<WorkflowState> = {}): Workflow {
  return {
    version: 1,
    id: "greet",
    name: "Greet every customer",
    initial: "greet",
    context: {},
    states: {
      greet: {
        type: "foreach",
        workflow: "reply",
        items: "{{input.customers}}",
        as: "customer",
        concurrency: 2,
        output: "replies",
        on: [{ to: "sent", event: "done" }],
        ...greet,
      },
      sent: { type: "final", on: [] },
    },
    layout: {},
  };
}

const workflows = { reply: replyWorkflow };

const start: StartInput = {
  ...startInput("sha-1"),
  workflowId: "greet",
  input: { customers: ["acme", "globex", "initech"] },
};

function told(childRunId: string, now: ChildRunNow): ChildInput {
  return { type: "child", at: "2026-11-09T09:01:00.000Z", childRunId, ...now };
}

const completed = (reply: string): ChildRunNow => ({ status: "completed", context: { reply } });

const bodies = (log: ReturnType<typeof play>["log"], from: number) =>
  log.slice(from).map(({ runId: _r, seq: _s, at: _a, ...body }) => body);

verifies("engine.foreach-workflow-items", () => {
  it("starts a child run per item up to its concurrency, with the item as its input", () => {
    const { log, decisions, run } = play(greetWorkflow(), [start], undefined, workflows);
    expect(bodies(log, 2)).toEqual([
      {
        type: "workflow.started",
        state: "greet",
        workflow: "reply",
        childRunId: "r-acme.2.0",
        item: 0,
      },
      {
        type: "workflow.started",
        state: "greet",
        workflow: "reply",
        childRunId: "r-acme.2.1",
        item: 1,
      },
    ]);
    expect(decisions[0]?.effects).toEqual([
      {
        type: "start-child",
        childRunId: "r-acme.2.0",
        state: "greet",
        workflowId: "reply",
        input: { customer: "acme" },
        depth: 1,
      },
      {
        type: "start-child",
        childRunId: "r-acme.2.1",
        state: "greet",
        workflowId: "reply",
        input: { customer: "globex" },
        depth: 1,
      },
    ]);
    expect(run).toMatchObject({ status: "running", child: null, foreach: { started: 2 } });
  });

  it("renders the state's input for each child, with the item and its index", () => {
    const greet = greetWorkflow({ input: { from: "{{customer}}", place: "{{index}}" } });
    const { decisions } = play(greet, [start], undefined, workflows);
    expect(decisions[0]?.effects).toMatchObject([
      { input: { from: "acme", place: 0 } },
      { input: { from: "globex", place: 1 } },
    ]);
  });

  it("keeps each child's context, starts the next item, and ends with the contexts in item order", () => {
    const { log, decisions, run } = play(
      greetWorkflow(),
      [
        start,
        told("r-acme.2.1", completed("Hi Globex")),
        told("r-acme.2.0", completed("Hi Acme")),
        told("r-acme.2.2", completed("Hi Initech")),
      ],
      undefined,
      workflows,
    );
    expect(bodies(log, 4)[0]).toEqual({
      type: "workflow.finished",
      state: "greet",
      workflow: "reply",
      childRunId: "r-acme.2.1",
      status: "completed",
      context: { reply: "Hi Globex" },
      item: 1,
    });
    expect(decisions[1]?.effects).toMatchObject([
      { type: "start-child", childRunId: "r-acme.2.2" },
    ]);
    expect(run).toMatchObject({
      status: "completed",
      context: {
        replies: [{ reply: "Hi Acme" }, { reply: "Hi Globex" }, { reply: "Hi Initech" }],
      },
    });
  });

  it("fails the run when an item's child run waits", () => {
    const waiting = told("r-acme.2.0", { status: "waiting", events: ["approve", "reject"] });
    const { log } = play(greetWorkflow(), [start, waiting], undefined, workflows);
    expect(log.at(-1)).toMatchObject({
      type: "run.failed",
      error:
        'Workflow "reply" in item 0 of for-each state "greet" waits for approve, reject; an item\'s child run must finish without waiting.',
    });
  });

  it("records the child's failure, then fails the run", () => {
    const failed = told("r-acme.2.1", { status: "failed", error: "No model." });
    const { log } = play(greetWorkflow(), [start, failed], undefined, workflows);
    expect(bodies(log, 4)).toEqual([
      {
        type: "workflow.finished",
        state: "greet",
        workflow: "reply",
        childRunId: "r-acme.2.1",
        status: "failed",
        error: "No model.",
        item: 1,
      },
      {
        type: "run.failed",
        state: "greet",
        error: 'Workflow "reply" failed in item 1 of for-each state "greet": No model.',
        reason: "error",
      },
    ]);
  });

  it("records the child's end, then ends the run, when it couldn't try a step (HAL-4285)", () => {
    const step = {
      status: "cant-try",
      item: "workflows/reply.yaml",
      step: "draft",
      reason: { kind: "needs-left-out-change", path: "models.yaml", leftOut: "models" },
    } as const;
    const ended = told("r-acme.2.1", { status: "cant-try", cantTry: [step] });
    const { log, run } = play(greetWorkflow(), [start, ended], undefined, workflows);
    expect(bodies(log, 4)).toEqual([
      {
        type: "workflow.finished",
        state: "greet",
        workflow: "reply",
        childRunId: "r-acme.2.1",
        item: 1,
        status: "cant-try",
      },
      { type: "run.cant-try", state: "greet", cantTry: [step] },
    ]);
    expect(run?.status).toBe("cant-try");
  });

  it("fails the run for its budget when an item's child run was stopped for its budget", () => {
    const stop = "Run budget reached: 0.60 of 0.50 EUR spent.";
    const failed = told("r-acme.2.0", { status: "failed", error: stop, reason: "budget" });
    const { log } = play(greetWorkflow(), [start, failed], undefined, workflows);
    expect(log.at(-1)).toMatchObject({
      type: "run.failed",
      error: `Workflow "reply" failed in item 0 of for-each state "greet": ${stop}`,
      reason: "budget",
    });
  });

  it("changes nothing for news of a run it doesn't wait on", () => {
    const other = told("r-other", completed("Hi"));
    const { decisions } = play(greetWorkflow(), [start, other], undefined, workflows);
    expect(decisions[1]).toEqual({ events: [], effects: [] });
  });

  it("fails the run when the workflow isn't among the run's definitions", () => {
    const { log } = play(greetWorkflow({ workflow: "billing" }), [start], undefined, workflows);
    expect(log.at(-1)).toMatchObject({
      type: "run.failed",
      error:
        'Workflow "billing" isn\'t among the definitions this run started with, so for-each state "greet" can\'t start it.',
    });
  });

  it(`fails a run whose items would nest more than ${maxChildDepth} deep`, () => {
    const parent = { runId: "r-up", state: "greet", depth: maxChildDepth };
    const { log } = play(greetWorkflow(), [{ ...start, parent }], undefined, workflows);
    expect(log.at(-1)).toMatchObject({
      type: "run.failed",
      error:
        'For-each state "greet" would start child runs 6 deep; child runs nest at most 5 deep.',
    });
  });
});
