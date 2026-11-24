import { runUsageOf, usageByTask } from "@halonicjs/events";
import type { Workflow } from "@halonicjs/format";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { KernelRuns, replyWorkflow, writerAgent } from "../kernel/kernel-test-kit.test-helper.ts";
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
    reply: { type: "workflow", workflow: "reply", input: {}, on: [{ to: "done", event: "done" }] },
    done: { type: "final", on: [] },
  },
  layout: {},
};

const task = { id: "HAL-42", branch: "acme/HAL-42-reply" };

verifies("engine.run-records-its-task", () => {
  it("records the task the run works on, on its run.started and in its state", async () => {
    const { executor, runs } = runsOn([textAnswer("Dear support")], new KernelRuns());

    await executor.start({ ...replyStart, task });

    const log = runs.logs.get("run_1") ?? [];
    expect(log[0]).toMatchObject({ type: "run.started", task });
    expect(foldRun(log)).toMatchObject({ task });
  });

  it("gives a child run the parent's task, so both add up on it", async () => {
    const { executor, runs, scheduler } = runsOn([textAnswer("Dear support")], new KernelRuns(), {
      workflow: onboard,
      workflows: { reply: replyWorkflow },
      agents: { writer: writerAgent() },
    });

    await executor.start({
      hubId: "acme",
      workflowId: "onboard",
      input: {},
      task: { id: "HAL-42" },
    });
    await scheduler.runDue();

    const childLog = runs.logs.get("run_1.2") ?? [];
    expect(childLog[0]).toMatchObject({ type: "run.started", task: { id: "HAL-42" } });
    const usages = [runs.logs.get("run_1") ?? [], childLog].map((log) => runUsageOf(log));
    const rollup = usageByTask(usages.filter((usage) => usage !== null)).get("HAL-42");
    expect(rollup?.runIds).toEqual(["run_1", "run_1.2"]);
    expect(rollup?.calls).toBe(1);
  });

  it("records no task for a run started without one", async () => {
    const { executor, runs } = runsOn([textAnswer("Dear support")], new KernelRuns());

    await executor.start(replyStart);

    const log = runs.logs.get("run_1") ?? [];
    expect(log[0]).not.toHaveProperty("task");
    expect(foldRun(log)).toMatchObject({ task: null });
  });
});
