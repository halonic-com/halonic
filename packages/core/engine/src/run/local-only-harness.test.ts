import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { finished, harnessPorts } from "../harness/harness-test-kit.test-helper.ts";
import { KernelRuns, writerAgent } from "../kernel/kernel-test-kit.test-helper.ts";
import { replyStart, runsOn, typesOf } from "./local-runs-test-kit.test-helper.ts";

const agents = { writer: writerAgent("claude-code") };

const refusal = `Agent "writer" runs in claude-code, which sends its work to its own cloud model, and the workspace is local only, so Halonic didn't start it.`;

const chatWithWriter = {
  hubId: "acme",
  agentId: "writer",
  messages: [{ role: "user" as const, content: "Draft a reply to support" }],
  tools: [],
};

verifies("engine.local-only", () => {
  it("refuses a chat with a harness agent in a local-only workspace, starting nothing", async () => {
    const ports = harnessPorts();
    ports.harness.events = [finished("Dear support")];
    const { executor, model } = runsOn([], new KernelRuns(), {
      agents,
      harnesses: ports.options,
      localOnly: true,
    });

    await expect(executor.chatTurn(chatWithWriter)).rejects.toMatchObject({
      name: "ModelCallError",
      reason: "local-only",
      message: refusal,
    });
    expect(ports.steps).toEqual([]);
    expect(ports.harness.tasks).toEqual([]);
    expect(model.requests).toEqual([]);
  });

  it("fails a run whose agent runs in a harness with local-only, starting nothing", async () => {
    const ports = harnessPorts();
    ports.harness.events = [finished("Dear support")];
    const { executor, runs, scheduler } = runsOn([], new KernelRuns(), {
      agents,
      harnesses: ports.options,
      localOnly: true,
    });

    await executor.start(replyStart);
    await scheduler.runDue();

    expect(await runs.get("run_1")).toMatchObject({ status: "failed", reason: "local-only" });
    expect(runs.logs.get("run_1")?.at(-1)).toMatchObject({
      type: "run.failed",
      reason: "local-only",
      error: refusal,
    });
    const types = typesOf(runs.logs.get("run_1"));
    expect(types).not.toContain("sandbox.started");
    expect(types).not.toContain("harness.started");
    expect(ports.steps).toEqual([]);
    expect(ports.harness.tasks).toEqual([]);
  });

  it("runs the harness agent as before when the workspace isn't local only", async () => {
    const ports = harnessPorts();
    ports.harness.events = [finished("Dear support")];
    const { executor } = runsOn([], new KernelRuns(), {
      agents,
      harnesses: ports.options,
      localOnly: false,
    });

    expect((await executor.chatTurn(chatWithWriter)).content).toBe("Dear support");
  });
});
