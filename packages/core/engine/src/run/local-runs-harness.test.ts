import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { KernelRuns, writerAgent } from "../kernel/kernel-test-kit.test-helper.ts";
import { replyStart, runsOn, typesOf } from "./local-runs-test-kit.test-helper.ts";

verifies("engine.local-runs-unbuilt-effect", () => {
  it("fails the run and sets no timer when its agent runs in a harness", async () => {
    const agents = { writer: writerAgent("claude-code") };
    const { executor, model, runs, scheduler } = runsOn([], new KernelRuns(), agents);

    const started = await executor.start(replyStart);

    expect(started).toMatchObject({ status: "failed", reason: "error" });
    expect(started.error).toContain("run-harness");
    expect(typesOf(runs.logs.get("run_1")).at(-1)).toBe("run.failed");
    expect(scheduler.timers.size).toBe(0);
    expect(model.requests).toEqual([]);
  });
});
