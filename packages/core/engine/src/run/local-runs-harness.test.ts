import type { Workflow } from "@halonicjs/format";
import type { HarnessEvent } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it, vi } from "vitest";
import { finished, harnessPorts, stillOpen } from "../harness/harness-test-kit.test-helper.ts";
import { KernelBlobs, KernelRuns, writerAgent } from "../kernel/kernel-test-kit.test-helper.ts";
import { harnessGoneError } from "./local-runs.ts";
import { replyStart, runsOn, typesOf } from "./local-runs-test-kit.test-helper.ts";

const agents = { writer: writerAgent("claude-code") };

verifies("engine.local-runs-unbuilt-effect", () => {
  it("fails the run and sets no timer when its agent runs in a harness and there are no harnesses", async () => {
    const { executor, model, runs, scheduler } = runsOn([], new KernelRuns(), { agents });

    const started = await executor.start(replyStart);

    expect(started).toMatchObject({ status: "failed", reason: "harness-unavailable" });
    expect(started.error).toContain("run-harness");
    expect(typesOf(runs.logs.get("run_1")).at(-1)).toBe("run.failed");
    expect(scheduler.timers.size).toBe(0);
    expect(model.requests).toEqual([]);
  });
});

verifies("engine.local-runs", () => {
  it("runs a harness agent from its timer, and finishes the state with its result", async () => {
    const ports = harnessPorts();
    ports.harness.events = [finished("Dear support")];
    const { executor, model, runs, scheduler } = runsOn([], new KernelRuns(), {
      agents,
      harnesses: ports.options,
    });

    await executor.start(replyStart);
    expect([...scheduler.timers.values()].map((timer) => timer.timerId)).toEqual([
      "harness:call-1",
    ]);
    await scheduler.runDue();

    expect(await runs.get("run_1")).toMatchObject({
      status: "completed",
      context: { reply: "Dear support" },
    });
    expect(typesOf(runs.logs.get("run_1"))).toEqual([
      "run.started",
      "state.entered",
      "agent.started",
      "sandbox.started",
      "sandbox.opened",
      "harness.started",
      "agent.finished",
      "context.updated",
      "transition",
      "state.entered",
      "run.completed",
    ]);
    expect(model.requests).toEqual([]);
  });

  it("finishes the state when the harness also reports its agent's own start", async () => {
    const ports = harnessPorts();
    ports.harness.events = [
      { type: "agent.started", agent: "writer", prompt: "Reply to support" },
      finished("Dear support"),
    ];
    const { executor, runs, scheduler } = runsOn([], new KernelRuns(), {
      agents,
      harnesses: ports.options,
    });

    await executor.start(replyStart);
    await scheduler.runDue();

    expect(await runs.get("run_1")).toMatchObject({
      status: "completed",
      context: { reply: "Dear support" },
    });
    expect(typesOf(runs.logs.get("run_1")).filter((type) => type === "agent.started")).toEqual([
      "agent.started",
    ]);
  });

  it("starts the harness once when its timer arrives twice", async () => {
    const ports = harnessPorts();
    ports.harness.events = [finished("Dear support")];
    const { executor, scheduler } = runsOn([], new KernelRuns(), {
      agents,
      harnesses: ports.options,
    });

    await executor.start(replyStart);
    await scheduler.runDue(2);

    expect(ports.harness.tasks).toHaveLength(1);
  });
});

verifies("engine.run-harness-failures", () => {
  it("fails the run with the reason the harness call gave", async () => {
    const ports = harnessPorts();
    ports.harness.error = new Error("claude: command not found");
    const { executor, runs, scheduler } = runsOn([], new KernelRuns(), {
      agents,
      harnesses: ports.options,
    });

    await executor.start(replyStart);
    await scheduler.runDue();

    expect(await runs.get("run_1")).toMatchObject({
      status: "failed",
      reason: "harness-start-failed",
    });
  });

  it("fails the run with sandbox-not-ready and the check's code when the sandbox can't start", async () => {
    const ports = harnessPorts();
    ports.sandbox.check = async () => ({
      ok: false,
      reason: "user-namespaces-restricted",
      missing: ["unprivileged user namespaces are restricted by AppArmor"],
    });
    const { executor, runs, scheduler } = runsOn([], new KernelRuns(), {
      agents,
      harnesses: ports.options,
    });

    await executor.start(replyStart);
    await scheduler.runDue();

    expect(await runs.get("run_1")).toMatchObject({
      status: "failed",
      reason: "sandbox-not-ready",
    });
    const failed = runs.logs.get("run_1")?.at(-1);
    expect(failed).toMatchObject({
      type: "run.failed",
      reason: "sandbox-not-ready",
      sandboxReason: "user-namespaces-restricted",
    });
    expect(JSON.stringify(failed)).not.toContain("AppArmor");
    expect(ports.steps).toEqual([]);
  });
});

verifies("engine.harness-start-limits", () => {
  it.each([
    ["sandbox", -1],
    ["sandbox", 0],
    ["harness", 1.5],
    ["harness", Number.NaN],
  ])("refuses a %s start limit of %s when the executor is created", (phase, timeoutMs) => {
    const ports = harnessPorts();
    const harnesses = { ...ports.options, startTimeoutsMs: { [phase]: timeoutMs } };

    expect(() => runsOn([], new KernelRuns(), { agents, harnesses })).toThrow(
      new RangeError(
        `startTimeoutsMs.${phase} must be a whole number of milliseconds of 1 or more, not ${timeoutMs}.`,
      ),
    );
  });

  it("fails the run with harness-start-failed when the start limit's timer arrives first", async () => {
    const ports = harnessPorts();
    ports.harness.hangs = true;
    const { executor, runs, scheduler } = runsOn([], new KernelRuns(), {
      agents,
      harnesses: ports.options,
    });

    await executor.start(replyStart);
    const harnessCall = scheduler.deliver("run_1", "harness:call-1");
    await scheduler.deliver("run_1", "start:harness:call-1");
    await harnessCall;

    expect(await runs.get("run_1")).toMatchObject({
      status: "failed",
      reason: "harness-start-failed",
    });
    expect(ports.steps.slice(-3)).toEqual(["harness.cancel", "session.close", "bridge.close"]);
    expect(scheduler.timers.size).toBe(0);
  });

  it("changes nothing when a start limit's timer arrives for a call it isn't running", async () => {
    const ports = harnessPorts();
    ports.harness.events = [finished("Dear support")];
    const { executor, runs, scheduler } = runsOn([], new KernelRuns(), {
      agents,
      harnesses: ports.options,
    });

    await executor.start(replyStart);
    await scheduler.runDue();
    await executor.onTimer({
      key: "run_1",
      timerId: "start:harness:call-1",
      at: "2026-01-05T09:01:00.000Z",
    });

    expect(await runs.get("run_1")).toMatchObject({ status: "completed" });
  });
});

verifies("engine.harness-stops-with-engine", () => {
  it("stops a harness run going on when the engine closes, and records nothing more", async () => {
    const ports = harnessPorts();
    ports.harness.hangs = true;
    const { executor, runs, scheduler } = runsOn([], new KernelRuns(), {
      agents,
      harnesses: ports.options,
    });

    await executor.start(replyStart);
    const harnessCall = scheduler.deliver("run_1", "harness:call-1");
    await vi.waitFor(() => expect(ports.steps).toContain("harness.start"));
    await executor.close();
    await harnessCall;

    expect(stillOpen(ports.steps)).toBe(0);
    expect(ports.steps.slice(-3)).toEqual(["harness.cancel", "session.close", "bridge.close"]);
    expect(await runs.get("run_1")).toMatchObject({ status: "running" });
    expect(typesOf(runs.logs.get("run_1")).at(-1)).toBe("harness.started");
  });

  it("starts no harness for a timer that arrives after the engine closed", async () => {
    const ports = harnessPorts();
    ports.harness.events = [finished("Dear support")];
    const { executor, runs, scheduler } = runsOn([], new KernelRuns(), {
      agents,
      harnesses: ports.options,
    });

    await executor.start(replyStart);
    await executor.close();
    await scheduler.runDue();

    expect(ports.steps).toEqual([]);
    expect(await runs.get("run_1")).toMatchObject({ status: "running" });
  });

  it("ends the run as interrupted when an engine next starts on the store, since a harness run can't resume", async () => {
    const ports = harnessPorts();
    ports.harness.hangs = true;
    const runs = new KernelRuns();
    const first = runsOn([], runs, { agents, harnesses: ports.options });
    await first.executor.start(replyStart);
    const harnessCall = first.scheduler.deliver("run_1", "harness:call-1");
    await vi.waitFor(() => expect(ports.steps).toContain("harness.start"));
    await first.executor.close();
    await harnessCall;

    const next = runsOn([], runs, { agents, harnesses: harnessPorts().options });
    await next.executor.start({ ...replyStart, runId: "run_2" });

    expect(await runs.get("run_1")).toMatchObject({ status: "failed", reason: "interrupted" });
  });
});

/** Labels each email of the run's input with the harness agent `writer`, two at a time. */
const triageWorkflow: Workflow = {
  version: 1,
  id: "reply",
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

verifies("engine.foreach-state", () => {
  it("runs two harness items at once, each writing to the log while the other does", async () => {
    const ports = harnessPorts();
    ports.harness.events = [finished("billing")];
    const { executor, runs, scheduler } = runsOn([], new KernelRuns(), {
      workflow: triageWorkflow,
      agents,
      harnesses: ports.options,
    });

    await executor.start({
      ...replyStart,
      input: { emails: [{ subject: "Refund" }, { subject: "Invoice" }] },
    });
    await Promise.all([
      scheduler.deliver("run_1", "harness:call-1"),
      scheduler.deliver("run_1", "harness:call-2"),
    ]);

    expect(await runs.get("run_1")).toMatchObject({
      status: "completed",
      context: { labels: ["billing", "billing"] },
    });
    expect(ports.harness.tasks).toHaveLength(2);
    const harnessStarts = runs.logs.get("run_1")?.filter(({ type }) => type === "harness.started");
    expect(harnessStarts?.map(({ item }) => item).sort()).toEqual([0, 1]);
  });
});

verifies("engine.harness-approvals", () => {
  /** The harness asks to run `rm -r drafts`, under its own call id. */
  const asks = (callId: string): HarnessEvent => ({
    type: "approval.requested",
    agent: "writer",
    callId,
    tool: "Bash",
    args: { command: "rm -r drafts" },
  });

  /** Starts the run and its harness call, and resolves once the run waits for a person. */
  async function waitingRun(ports: ReturnType<typeof harnessPorts>, runs = new KernelRuns()) {
    const blobs = new KernelBlobs();
    const setup = runsOn([], runs, { agents, harnesses: ports.options, blobs });
    await setup.executor.start(replyStart);
    const harnessCall = setup.scheduler.deliver("run_1", "harness:call-1");
    await vi.waitFor(async () =>
      expect(await runs.get("run_1")).toMatchObject({ status: "waiting" }),
    );
    return { ...setup, harnessCall };
  }

  it("waits for a person while the harness keeps running, and passes the answer on", async () => {
    const ports = harnessPorts();
    ports.harness.events = [asks("toolu_7"), finished("Dear support")];
    const { executor, model, runs, harnessCall } = await waitingRun(ports);

    expect(await runs.get("run_1")).toMatchObject({
      accepts: ["approve", "reject"],
      approvals: [{ callId: "call-2", tool: "Bash" }],
    });
    expect(stillOpen(ports.steps)).toBe(3);
    const byHarnessId = executor.send("run_1", "approve", undefined, { callId: "toolu_7" });
    await expect(byHarnessId).rejects.toMatchObject({ code: "engine.decision-callid-must-match" });

    await executor.send("run_1", "approve", { comment: "Fine" }, { callId: "call-2" });
    await harnessCall;

    expect(ports.harness.sent).toEqual([
      { type: "approval", callId: "toolu_7", approved: true, comment: "Fine" },
    ]);
    expect(await runs.get("run_1")).toMatchObject({
      status: "completed",
      context: { reply: "Dear support" },
    });
    expect(typesOf(runs.logs.get("run_1")).slice(5, 11)).toEqual([
      "harness.started",
      "approval.requested",
      "run.waiting",
      "event.received",
      "approval.resolved",
      "agent.finished",
    ]);
    expect(stillOpen(ports.steps)).toBe(0);
    expect(model.requests).toEqual([]);
  });

  it("stores what the bridge and the sandbox report while the run waits after the answer", async () => {
    const ports = harnessPorts();
    ports.harness.events = [asks("toolu_7"), finished("Dear support")];
    const { executor, runs, harnessCall } = await waitingRun(ports);

    // A Halonic tool call through the bridge, and a block by the fence, while the person reads.
    const recorded = ports.recorders[0]?.record({
      type: "tool.called",
      agent: "writer",
      tool: "halonic.search",
      args: { query: "drafts" },
    });
    ports.sandbox.block({ kind: "network", host: "api.example.com", port: 443 });
    await executor.send("run_1", "approve", undefined, { callId: "call-2" });
    await recorded;
    await harnessCall;

    expect(await runs.get("run_1")).toMatchObject({
      status: "completed",
      context: { reply: "Dear support" },
    });
    const types = typesOf(runs.logs.get("run_1"));
    expect(types.slice(types.indexOf("run.waiting"), types.indexOf("agent.finished") + 1)).toEqual([
      "run.waiting",
      "event.received",
      "approval.resolved",
      "tool.called",
      "sandbox.blocked",
      "agent.finished",
    ]);
  });

  it("takes two approvals in a row in one harness call, and finishes after a rejection", async () => {
    const ports = harnessPorts();
    ports.harness.events = [asks("toolu_1"), asks("toolu_2"), finished("Left the drafts alone")];
    const { executor, runs, harnessCall } = await waitingRun(ports);

    await executor.send("run_1", "approve", undefined, { callId: "call-2" });
    await vi.waitFor(async () =>
      expect(await runs.get("run_1")).toMatchObject({ approvals: [{ callId: "call-4" }] }),
    );
    await executor.send("run_1", "reject", undefined, { callId: "call-4" });
    await harnessCall;

    expect(ports.harness.sent).toEqual([
      { type: "approval", callId: "toolu_1", approved: true },
      { type: "approval", callId: "toolu_2", approved: false },
    ]);
    expect(ports.harness.tasks).toHaveLength(1);
    expect(await runs.get("run_1")).toMatchObject({
      status: "completed",
      context: { reply: "Left the drafts alone" },
    });
  });

  it("stops the harness when the engine closes while the run waits, and leaves the run waiting", async () => {
    const ports = harnessPorts();
    ports.harness.events = [asks("toolu_7"), finished("Dear support")];
    const { executor, runs, harnessCall } = await waitingRun(ports);

    await executor.close();
    await harnessCall;

    expect(stillOpen(ports.steps)).toBe(0);
    expect(ports.steps.slice(-3)).toEqual(["harness.cancel", "session.close", "bridge.close"]);
    expect(await runs.get("run_1")).toMatchObject({ status: "waiting" });
  });

  it("ends the run as interrupted when the answer comes after a restart, and starts nothing", async () => {
    const ports = harnessPorts();
    ports.harness.events = [asks("toolu_7"), finished("Dear support")];
    const runs = new KernelRuns();
    const first = await waitingRun(ports, runs);
    await first.executor.close();
    await first.harnessCall;

    const nextPorts = harnessPorts();
    const next = runsOn([], runs, { agents, harnesses: nextPorts.options, blobs: first.blobs });
    await next.executor.send("run_1", "approve", undefined, { callId: "call-2" });
    await next.scheduler.runDue();

    expect(await runs.get("run_1")).toMatchObject({
      status: "failed",
      reason: "interrupted",
      error: harnessGoneError,
    });
    expect(nextPorts.steps).toEqual([]);
    expect(next.model.requests).toEqual([]);
  });

  it("fails a for-each item's harness call that asks, instead of waiting for an answer", async () => {
    const ports = harnessPorts();
    ports.harness.events = [asks("toolu_7"), finished("billing")];
    const { executor, runs, scheduler } = runsOn([], new KernelRuns(), {
      workflow: triageWorkflow,
      agents,
      harnesses: ports.options,
    });

    await executor.start({ ...replyStart, input: { emails: [{ subject: "Refund" }] } });
    await scheduler.deliver("run_1", "harness:call-1");

    expect(await runs.get("run_1")).toMatchObject({
      status: "failed",
      error:
        'Agent "writer" asked for an approval of "Bash" where its run can\'t wait for one, as in an item of a for-each state.',
    });
    expect(ports.harness.sent).toEqual([]);
    expect(stillOpen(ports.steps)).toBe(0);
  });
});
