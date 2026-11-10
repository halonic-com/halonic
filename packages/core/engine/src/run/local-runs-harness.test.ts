import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { finished, harnessPorts } from "../harness/harness-test-kit.test-helper.ts";
import { KernelRuns, writerAgent } from "../kernel/kernel-test-kit.test-helper.ts";
import { replyStart, runsOn, typesOf } from "./local-runs-test-kit.test-helper.ts";

const agents = { writer: writerAgent("claude-code") };

verifies("engine.local-runs-unbuilt-effect", () => {
  it("fails the run and sets no timer when its agent runs in a harness and there are no harnesses", async () => {
    const { executor, model, runs, scheduler } = runsOn([], new KernelRuns(), { agents });

    const started = await executor.start(replyStart);

    expect(started).toMatchObject({ status: "failed", reason: "error" });
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
});
