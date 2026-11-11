// A harness run keeps to the run's budget call by call: the bridge asks before
// each model call it passes on, not only the step before the run (HAL-5206).

import type { BridgeEvent, BridgeRecorder } from "@halonicjs/ports";
import { errorKindOf } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { harnessPorts, stillOpen } from "../harness/harness-test-kit.test-helper.ts";
import { KernelRuns, writerAgent } from "../kernel/kernel-test-kit.test-helper.ts";
import { replyStart, runsOn, typesOf } from "./local-runs-test-kit.test-helper.ts";

const agents = { writer: writerAgent("claude-code") };

/** One model call through the bridge, as `recordModelCall` records it: its request, then its reply's cost. */
async function modelCall(recorder: BridgeRecorder, cost: number): Promise<void> {
  const call = { agent: "writer", provider: "anthropic" as const, model: "claude-sonnet-4" };
  await recorder.record({ type: "llm.request", ...call, messages: 1 });
  const response: BridgeEvent = {
    type: "llm.response",
    ...call,
    usage: { inputTokens: 10, outputTokens: 5 },
    latencyMs: 1,
    text: "",
    cost,
  };
  await recorder.record(response);
}

/**
 * A harness that makes model calls through its bridge, one after the other,
 * until the bridge refuses one, and then hangs as a program that waits for a
 * retry would. It gives back the error the bridge answered with.
 */
function callsUntilRefused(ports: ReturnType<typeof harnessPorts>, cost: number) {
  const refused = Promise.withResolvers<unknown>();
  ports.harness.hangs = true;
  ports.harness.whileRunning = () => {
    const recorder = ports.recorders.at(-1);
    if (recorder === undefined) throw new Error("The harness started without a bridge.");
    void (async () => {
      for (let call = 1; call <= 50; call += 1) {
        try {
          await modelCall(recorder, cost);
        } catch (error) {
          refused.resolve(error);
          return;
        }
      }
      refused.resolve(undefined);
    })();
  };
  return refused.promise;
}

verifies("engine.budget-stops", () => {
  it("refuses a harness's model call once the run budget is reached, and stops the run there", async () => {
    const ports = harnessPorts();
    const refused = callsUntilRefused(ports, 0.6);
    const { executor, runs, scheduler } = runsOn([], new KernelRuns(), {
      agents,
      harnesses: ports.options,
      budget: { currency: "EUR", perRun: 1.5 },
    });

    await executor.start(replyStart);
    await scheduler.runDue();

    const error = await refused;
    expect(errorKindOf(error)).toBe("limit_reached");
    expect((error as Error).message).toBe("Run budget reached: 1.80 of 1.50 EUR spent.");
    expect(await runs.get("run_1")).toMatchObject({
      status: "failed",
      state: "draft",
      reason: "budget",
      error: "Run budget reached: 1.80 of 1.50 EUR spent.",
    });
    const log = typesOf(runs.logs.get("run_1"));
    expect(log.filter((type) => type === "llm.request")).toHaveLength(3);
    expect(log.filter((type) => type === "llm.response")).toHaveLength(3);
    expect(log.at(-1)).toBe("run.failed");
    expect(stillOpen(ports.steps)).toBe(0);
  });

  it("refuses a harness's model call once the monthly budget is reached", async () => {
    const ports = harnessPorts();
    const refused = callsUntilRefused(ports, 0.6);
    const { executor, runs, scheduler } = runsOn([], new KernelRuns(), {
      agents,
      harnesses: ports.options,
      budget: { currency: "EUR", monthly: 1 },
    });

    await executor.start(replyStart);
    await scheduler.runDue();

    expect(errorKindOf(await refused)).toBe("limit_reached");
    expect(await runs.get("run_1")).toMatchObject({
      status: "failed",
      reason: "budget",
      error: "Monthly budget reached: 1.20 of 1.00 EUR spent this month.",
    });
  });
});
