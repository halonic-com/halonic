import type { Workflow } from "@halonicjs/format";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it, vi } from "vitest";
import { harnessPorts, stillOpen } from "../harness/harness-test-kit.test-helper.ts";
import {
  approvalWorkflow,
  KernelRuns,
  replyWorkflow,
  writerAgent,
} from "../kernel/kernel-test-kit.test-helper.ts";
import { textAnswer } from "../testing/scripted-model.ts";
import { cancelledError } from "./local-runs.ts";
import { replyStart, runsOn, typesOf } from "./local-runs-test-kit.test-helper.ts";

/** A parent whose first state runs the `approval` workflow and waits on it. */
const onboard: Workflow = {
  version: 1,
  id: "onboard",
  name: "Onboard a customer",
  initial: "check",
  context: {},
  states: {
    check: {
      type: "workflow",
      workflow: "approval",
      input: {},
      on: [{ to: "welcome", event: "done" }],
    },
    welcome: { type: "final", on: [] },
  },
  layout: {},
};

const cancelled = { status: "failed", reason: "cancelled", error: cancelledError };

verifies("engine.local-run-cancel", () => {
  it("ends a running run as cancelled, and records nothing its model call gives later", async () => {
    const { executor, runs, scheduler } = runsOn([textAnswer("Dear support")]);
    await executor.start(replyStart);

    const summary = await executor.cancel("run_1");
    await scheduler.runDue();

    expect(summary).toMatchObject(cancelled);
    expect(await runs.get("run_1")).toMatchObject(cancelled);
    expect(typesOf(runs.logs.get("run_1")).at(-1)).toBe("run.failed");
  });

  it("ends a run that waits for an event", async () => {
    const { executor } = runsOn([], new KernelRuns(), { workflow: approvalWorkflow() });
    expect(await executor.start({ ...replyStart, workflowId: "approval" })).toMatchObject({
      status: "waiting",
    });

    expect(await executor.cancel("run_1")).toMatchObject(cancelled);
  });

  it("ends the child run a run waits on, and the run with its own reason", async () => {
    const { executor, runs } = runsOn([], new KernelRuns(), {
      workflow: onboard,
      workflows: { approval: approvalWorkflow() },
    });
    await executor.start({ ...replyStart, workflowId: "onboard" });

    await executor.cancel("run_1");

    expect(await runs.get("run_1")).toMatchObject(cancelled);
    expect(await runs.get("run_1.2")).toMatchObject(cancelled);
  });

  it("leaves a run that has ended as it is", async () => {
    const { executor, runs, scheduler } = runsOn([textAnswer("Dear support")]);
    await executor.start(replyStart);
    await scheduler.runDue();
    const events = typesOf(runs.logs.get("run_1"));

    expect(await executor.cancel("run_1")).toMatchObject({ status: "completed" });
    expect(typesOf(runs.logs.get("run_1"))).toEqual(events);
  });

  it("refuses a run that doesn't exist", async () => {
    const { executor } = runsOn([]);

    await expect(executor.cancel("run_9")).rejects.toMatchObject({
      code: "engine.run-unknown",
      message: 'There\'s no run "run_9".',
    });
  });

  it("stops the run's harness call and everything it opened", async () => {
    const ports = harnessPorts();
    ports.harness.hangs = true;
    const { executor, runs, scheduler } = runsOn([], new KernelRuns(), {
      agents: { writer: writerAgent("claude-code") },
      harnesses: ports.options,
      workflow: replyWorkflow,
    });
    await executor.start(replyStart);
    const harnessCall = scheduler.deliver("run_1", "harness:call-1");
    await vi.waitFor(() => expect(ports.steps).toContain("harness.start"));

    await executor.cancel("run_1");
    await harnessCall;

    expect(stillOpen(ports.steps)).toBe(0);
    expect(await runs.get("run_1")).toMatchObject(cancelled);
  });
});
