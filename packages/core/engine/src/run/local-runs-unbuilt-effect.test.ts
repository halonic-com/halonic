import { verifies } from "@halonicjs/testing-spec";
import { expect, it, vi } from "vitest";
import type { CallToolEffect } from "../kernel/decide-types.ts";
import { replyStart, runsOn, typesOf } from "./local-runs-test-kit.test-helper.ts";

const toolCall: CallToolEffect = {
  type: "call-tool",
  callId: "call-1",
  idempotencyKey: "run_1:call-1",
  state: "draft",
  agent: "writer",
  connector: "mail",
  tool: "send-mail",
  args: {},
  timeoutMs: 60_000,
};

// No built state asks for a tool call yet, so the start's step asks for one here.
vi.mock("../kernel/step.ts", async (importOriginal) => {
  const real = await importOriginal<typeof import("../kernel/step.ts")>();
  return {
    ...real,
    step: async (...args: Parameters<typeof real.step>) => {
      const result = await real.step(...args);
      return { ...result, effects: [...result.effects, toolCall] };
    },
  };
});

verifies("engine.local-runs-unbuilt-effect", () => {
  it("fails the run and sets no timer when a step asks for a tool call", async () => {
    const { executor, runs, scheduler } = runsOn([]);

    const started = await executor.start(replyStart);

    expect(started).toMatchObject({ status: "failed", reason: "error" });
    expect(started.error).toContain("call-tool");
    expect(typesOf(runs.logs.get("run_1")).at(-1)).toBe("run.failed");
    expect(scheduler.timers.size).toBe(0);
  });
});
