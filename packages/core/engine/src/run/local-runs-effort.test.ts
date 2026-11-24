import type { RunEvent } from "@halonicjs/events";
import type { Workflow } from "@halonicjs/format";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { finished, harnessPorts } from "../harness/harness-test-kit.test-helper.ts";
import { KernelRuns, replyWorkflow, writerAgent } from "../kernel/kernel-test-kit.test-helper.ts";
import { foldRun } from "../kernel/run-state.ts";
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

/** Starts the reply workflow with `effort` in a harness and runs it to its end. */
async function runReply(effort: "low" | "default" | undefined) {
  const ports = harnessPorts();
  ports.harness.events = [finished("Dear support")];
  const { executor, runs, scheduler } = runsOn([], new KernelRuns(), {
    agents: { writer: writerAgent("claude-code") },
    harnesses: ports.options,
  });
  await executor.start({ ...replyStart, ...(effort === undefined ? {} : { effort }) });
  await scheduler.runDue();
  const log = runs.logs.get("run_1") ?? [];
  return { started: log[0], agent: ports.bridgeAgents[0], log };
}

verifies("engine.run-effort", () => {
  it("records a low run's effort and gives it to its harness agent", async () => {
    const { started, agent } = await runReply("low");

    expect(started).toMatchObject({ type: "run.started", effort: "low" });
    expect(agent?.effort).toBe("low");
  });

  it("records no effort for a default run and gives its harness agent the default", async () => {
    const { started, agent } = await runReply("default");

    expect(started).not.toHaveProperty("effort");
    expect(agent?.effort).toBe("default");
  });

  it("falls back to the default for a run started without an effort", async () => {
    const { started, agent } = await runReply(undefined);

    expect(started).not.toHaveProperty("effort");
    expect(agent?.effort).toBe("default");
  });

  it("reads the effort again from the run's log", async () => {
    const low = await runReply("low");
    const kept = await runReply(undefined);

    const stored = (log: RunEvent[]) => JSON.parse(JSON.stringify(log)) as RunEvent[];
    expect(foldRun(stored(low.log))?.effort).toBe("low");
    expect(foldRun(stored(kept.log))?.effort).toBe("default");
  });

  it("gives a child run the parent's low effort on its run.started", async () => {
    const ports = harnessPorts();
    ports.harness.events = [finished("Dear support")];
    const { executor, runs, scheduler } = runsOn([], new KernelRuns(), {
      workflow: onboard,
      workflows: { reply: replyWorkflow },
      agents: { writer: writerAgent("claude-code") },
      harnesses: ports.options,
    });

    await executor.start({
      hubId: "acme",
      workflowId: "onboard",
      input: { from: "ada@example.com" },
      effort: "low",
    });
    await scheduler.runDue();

    expect(runs.logs.get("run_1.2")?.[0]).toMatchObject({ type: "run.started", effort: "low" });
    expect(ports.bridgeAgents.map((agent) => agent.effort)).toEqual(["low"]);
  });
});
