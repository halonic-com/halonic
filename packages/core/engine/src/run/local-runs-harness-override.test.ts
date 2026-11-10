import type { RunEvent } from "@halonicjs/events";
import type { Agent, Workflow } from "@halonicjs/format";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { finished, harnessPorts } from "../harness/harness-test-kit.test-helper.ts";
import { decide } from "../kernel/decide.ts";
import type { DecideInput } from "../kernel/decide-types.ts";
import {
  KernelBlobs,
  KernelRuns,
  play,
  replyWorkflow,
  startInput,
  writerAgent,
} from "../kernel/kernel-test-kit.test-helper.ts";
import { foldRun } from "../kernel/run-state.ts";
import { textAnswer } from "../testing/scripted-model.ts";
import { replyStart, runsOn } from "./local-runs-test-kit.test-helper.ts";

/** A parent whose one state runs the reply workflow as a child run. */
const onboard: Workflow = {
  version: 1,
  id: "onboard",
  name: "Onboard a customer",
  initial: "reply",
  context: {},
  states: {
    reply: {
      type: "workflow",
      workflow: "reply",
      input: { from: "{{input.from}}" },
      on: [{ to: "welcome", event: "done" }],
    },
    welcome: { type: "final", on: [] },
  },
  layout: {},
};

/** A `research` state whose two branches run the searcher and the reader at once. */
const research: Workflow = {
  version: 1,
  id: "research",
  name: "Research a topic",
  initial: "research",
  context: {},
  states: {
    research: {
      type: "parallel",
      branches: {
        web: { agent: "searcher", input: "Search the web for {{input.topic}}" },
        notes: { agent: "reader", input: "Read the notes on {{input.topic}}" },
      },
      output: "findings",
      on: [{ to: "done", event: "done" }],
    },
    done: { type: "final", on: [] },
  },
  layout: {},
};

function researchAgents(harness?: Agent["harness"]): Record<string, Agent> {
  return {
    searcher: { ...writerAgent(harness), id: "searcher" },
    reader: { ...writerAgent(), id: "reader" },
  };
}

const researchStart = { ...startInput("sha-1"), workflowId: "research", input: { topic: "tea" } };

/** A `triage` state that runs the writer once for each email, two at a time. */
const triage: Workflow = {
  version: 1,
  id: "triage",
  name: "Triage the inbox",
  initial: "triage",
  context: {},
  states: {
    triage: {
      type: "foreach",
      agent: "writer",
      items: "{{input.emails}}",
      as: "email",
      concurrency: 2,
      input: "Label {{email.subject}}",
      output: "labels",
      on: [{ to: "filed", event: "done" }],
    },
    filed: { type: "final", on: [] },
  },
  layout: {},
};

verifies("engine.run-harness-override", () => {
  it("runs a task agent in the run's harness instead of the one its file names", () => {
    const start = { ...startInput("sha-1"), harness: "codex" };

    const { decisions, run } = play(replyWorkflow, [start], { writer: writerAgent() });

    expect(decisions[0]?.events[0]).toMatchObject({ type: "run.started", harness: "codex" });
    expect(decisions[0]?.effects).toEqual([
      expect.objectContaining({ type: "run-harness", harness: "codex", callId: "call-1" }),
    ]);
    expect(run).toMatchObject({ harness: "codex" });
  });

  it("runs a harness agent in Halonic's own loop when the run's harness is halonic", () => {
    const start = { ...startInput("sha-1"), harness: "halonic" };
    const agents = { writer: writerAgent("claude-code") };

    const { decisions } = play(replyWorkflow, [start], agents);

    expect(decisions[0]?.effects).toEqual([expect.objectContaining({ type: "call-model" })]);
  });

  it("decides the same on a replayed log as in the live run", () => {
    const start = { ...startInput("sha-1"), harness: "codex" };
    const asked: DecideInput = {
      type: "harness-asked",
      at: "2026-11-09T09:00:05.000Z",
      callId: "call-1",
      tool: "Bash",
      args: { command: "ls" },
    };
    const approve: DecideInput = { type: "send", at: "2026-11-09T10:00:00.000Z", event: "approve" };
    const agents = { writer: writerAgent() };
    const live = play(replyWorkflow, [start, asked, approve], agents);
    const stored = play(replyWorkflow, [start, asked], agents).log;

    const replayed = foldRun(JSON.parse(JSON.stringify(stored)) as RunEvent[]);
    const decision = decide(replayed, approve, { workflow: replyWorkflow, agents });

    expect(decision).toEqual(live.decisions[2]);
    expect(decision.effects.map((effect) => effect.type)).toEqual(["answer-harness"]);
  });

  it("fails a parallel state whose branch agent would run in the run's program harness", () => {
    const start = { ...researchStart, harness: "codex" };

    const { run, log } = play(research, [start], researchAgents());

    expect(run?.status).toBe("failed");
    expect(log.at(-1)).toMatchObject({
      error:
        'Branch "notes" of parallel state "research" runs agent "reader" in the run\'s "codex" ' +
        "harness, and parallel branches can't run a harness yet.",
    });
  });

  it("runs a parallel branch's harness agent as a model call when the run's harness is halonic", () => {
    const start = { ...researchStart, harness: "halonic" };

    const { decisions } = play(research, [start], researchAgents("claude-code"));

    expect(decisions[0]?.effects.map((effect) => effect.type)).toEqual([
      "call-model",
      "call-model",
    ]);
  });

  it("runs each for-each item's agent in the run's harness", () => {
    const start = {
      ...startInput("sha-1"),
      workflowId: "triage",
      input: { emails: [{ subject: "Refund" }, { subject: "Invoice" }] },
      harness: "codex",
    };

    const { decisions } = play(triage, [start], { writer: writerAgent() });

    expect(decisions[0]?.effects).toEqual([
      expect.objectContaining({ type: "run-harness", harness: "codex", callId: "call-1" }),
      expect.objectContaining({ type: "run-harness", harness: "codex", callId: "call-2" }),
    ]);
  });

  it("refuses a harness that isn't one before anything is written", async () => {
    const blobs = new KernelBlobs();
    const { executor, runs } = runsOn([], new KernelRuns(), { blobs });

    const start = executor.start({ ...replyStart, harness: "claude" });

    await expect(start).rejects.toThrow(
      new RangeError('"claude" isn\'t a harness. The harnesses are halonic, claude-code, codex.'),
    );
    expect(runs.logs.size).toBe(0);
    expect(blobs.blobs.size).toBe(0);
  });

  it("runs the agent in the run's harness through the executor", async () => {
    const ports = harnessPorts();
    ports.harness.events = [finished("Dear support")];
    const { executor, model, runs, scheduler } = runsOn([], new KernelRuns(), {
      agents: { writer: writerAgent() },
      harnesses: ports.options,
    });

    await executor.start({ ...replyStart, harness: "claude-code" });
    await scheduler.runDue();

    expect(ports.harness.tasks).toHaveLength(1);
    expect(model.requests).toEqual([]);
    expect(await runs.get("run_1")).toMatchObject({ status: "completed" });
  });

  it("gives a child run the parent's harness, and records it on the child's run.started", async () => {
    const { executor, model, runs, scheduler } = runsOn(
      [textAnswer("Dear support")],
      new KernelRuns(),
      {
        workflow: onboard,
        workflows: { reply: replyWorkflow },
        agents: { writer: writerAgent("claude-code") },
      },
    );

    await executor.start({ hubId: "acme", workflowId: "onboard", input: {}, harness: "halonic" });
    await scheduler.runDue();

    expect(runs.logs.get("run_1.2")?.[0]).toMatchObject({
      type: "run.started",
      harness: "halonic",
    });
    // The writer's file names Claude Code, but the run's harness has it answer as a model call.
    expect(model.requests).toHaveLength(1);
    expect(await runs.get("run_1")).toMatchObject({ status: "completed" });
  });
});
