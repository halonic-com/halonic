import type { BridgeEvent } from "@halonicjs/ports";
import { errorKindOf } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { failedCallInput } from "../run/failed-call-input.ts";
import { runCallOn, writerCall } from "./harness-call-test-kit.test-helper.ts";
import { finished, harnessPorts, startLimits, stillOpen } from "./harness-test-kit.test-helper.ts";
import type { HarnessCall } from "./run-harness-call.ts";
import type { HarnessLimits } from "./step-limits.ts";

const request = {
  type: "llm.request",
  agent: "writer",
  provider: "anthropic",
  model: "m",
  messages: 1,
} as const satisfies BridgeEvent;

/** A model call's answer, as the bridge records it. */
type ModelAnswer = Extract<BridgeEvent, { type: "llm.response" }>;

/** An answer that cost `cost`, as the bridge records it. */
function response(cost: number): ModelAnswer {
  return {
    type: "llm.response",
    agent: "writer",
    provider: "anthropic",
    model: "m",
    usage: { inputTokens: 10, outputTokens: 5 },
    latencyMs: 100,
    text: "",
    cost,
  };
}

/**
 * An answer that used `tokens` tokens and that a subscription paid, as the
 * bridge records it; `subAgent` splits them as a `Task` sub-agent's call
 * does, with cache reads and writes, under the run's agent.
 */
function subscriptionResponse(tokens: number, subAgent = false): BridgeEvent {
  const usage = subAgent
    ? { inputTokens: 100, outputTokens: 50, cacheReadTokens: tokens - 200, cacheWriteTokens: 50 }
    : { inputTokens: tokens - 100, outputTokens: 100 };
  return { ...response(0), usage, paidBy: "subscription" };
}

/** The writer's call, with `harnessLimits` on its agent. */
function limitedCall(harnessLimits?: HarnessLimits): HarnessCall {
  return {
    ...writerCall,
    agent: { ...writerCall.agent, ...(harnessLimits === undefined ? {} : { harnessLimits }) },
  };
}

/**
 * Ports whose program keeps working until it's stopped and, once started,
 * records `events` through the bridge one after the other. What the bridge
 * refused is in `refused`.
 */
function programRecording(events: readonly BridgeEvent[]) {
  const ports = harnessPorts();
  ports.harness.hangs = true;
  const refused: unknown[] = [];
  const recorded = Promise.withResolvers<void>();
  ports.harness.whileRunning = () => {
    void (async () => {
      for (const event of events) {
        await ports.recorders[0]?.record(event).catch((error: unknown) => refused.push(error));
      }
      recorded.resolve();
    })();
  };
  return { ports, refused, recorded: recorded.promise };
}

verifies("engine.harness-step-limits", () => {
  it("refuses the model call past maxSteps, logs no request for it, and stops everything", async () => {
    const { ports, refused, recorded } = programRecording([request, request, request]);

    const { error, written } = await runCallOn(
      ports,
      undefined,
      undefined,
      undefined,
      limitedCall({ maxSteps: 2 }),
    );
    await recorded;

    expect((error as Error).message).toBe(
      'Agent "writer" used all 2 of its steps (harnessLimits.maxSteps), so Halonic stopped Claude Code.',
    );
    expect(refused.map(errorKindOf)).toEqual(["limit_reached"]);
    expect(written.filter((event) => event.type === "llm.request")).toHaveLength(2);
    expect(ports.steps.slice(-3)).toEqual(["harness.cancel", "session.close", "bridge.close"]);
    expect(stillOpen(ports.steps)).toBe(0);
  });

  it("fails the step with the reason error and the typed cause of the limit", async () => {
    const { ports } = programRecording([request, request]);

    const { error } = await runCallOn(
      ports,
      undefined,
      undefined,
      undefined,
      limitedCall({ maxSteps: 1 }),
    );

    expect(
      failedCallInput(error, { callId: "call-1", at: "2026-11-18T10:00:00.000Z", step: "draft" }),
    ).toMatchObject({
      reason: "error",
      cause: {
        kind: "limit_reached",
        code: "harness.max-steps",
        detail: { limit: "1", used: "1" },
      },
    });
  });

  it("stops once the answers have cost maxCost, and refuses every later call", async () => {
    const { ports, refused, recorded } = programRecording([
      request,
      response(0.6),
      request,
      response(0.5),
      request,
    ]);

    const { error, written } = await runCallOn(
      ports,
      undefined,
      undefined,
      undefined,
      limitedCall({ maxCost: 1 }),
    );
    await recorded;

    expect((error as Error).message).toBe(
      'Agent "writer" spent 1.10 of its 1.00 (harnessLimits.maxCost), so Halonic stopped Claude Code.',
    );
    expect(
      failedCallInput(error, { callId: "call-1", at: "2026-11-18T10:00:00.000Z", step: "draft" })
        .cause,
    ).toEqual({
      kind: "limit_reached",
      code: "harness.max-cost",
      detail: { limit: "1.00", used: "1.10" },
    });
    expect(refused.map(errorKindOf)).toEqual(["limit_reached"]);
    expect(written.filter((event) => event.type === "llm.request")).toHaveLength(2);
    expect(stillOpen(ports.steps)).toBe(0);
  });

  it("stops once the answers, a sub-agent's and subscription calls included, used maxTokens", async () => {
    const { ports, refused, recorded } = programRecording([
      request,
      subscriptionResponse(600),
      request,
      subscriptionResponse(500, true),
      request,
    ]);

    const { error, written } = await runCallOn(
      ports,
      undefined,
      undefined,
      undefined,
      limitedCall({ maxTokens: 1000 }),
    );
    await recorded;

    expect((error as Error).message).toBe(
      'Agent "writer" used 1100 of its 1000 tokens (harnessLimits.maxTokens), so Halonic stopped Claude Code.',
    );
    expect(
      failedCallInput(error, { callId: "call-1", at: "2026-11-18T10:00:00.000Z", step: "draft" }),
    ).toMatchObject({
      reason: "error",
      cause: {
        kind: "limit_reached",
        code: "harness.max-tokens",
        detail: { limit: "1000", used: "1100" },
      },
    });
    expect(refused.map(errorKindOf)).toEqual(["limit_reached"]);
    expect(written.filter((event) => event.type === "llm.request")).toHaveLength(2);
    expect(ports.steps.slice(-3)).toEqual(["harness.cancel", "session.close", "bridge.close"]);
    expect(stillOpen(ports.steps)).toBe(0);
  });

  it("goes on below maxTokens", async () => {
    const { ports, refused, recorded } = programRecording([
      request,
      subscriptionResponse(600),
      request,
      subscriptionResponse(300, true),
    ]);
    ports.harness.hangs = false;
    ports.harness.events = [finished("Done")];

    const { output } = await runCallOn(
      ports,
      undefined,
      undefined,
      undefined,
      limitedCall({ maxTokens: 1000 }),
    );
    await recorded;

    expect(output).toBe("Done");
    expect(refused).toEqual([]);
  });

  it("stops the step when its maxMinutes timer arrives", async () => {
    const ports = harnessPorts();
    ports.harness.events = [{ type: "tool.called", agent: "writer", tool: "Read", args: {} }];
    ports.harness.hangs = true;
    const { limits, timeUp } = startLimits();

    const running = runCallOn(ports, limits, undefined, undefined, limitedCall({ maxMinutes: 10 }));
    await timeUp("step");
    const { error } = await running;

    expect((error as Error).message).toBe(
      'Agent "writer" ran for its 10 minutes (harnessLimits.maxMinutes), so Halonic stopped Claude Code.',
    );
    expect(
      failedCallInput(error, { callId: "call-1", at: "2026-11-18T10:00:00.000Z", step: "draft" })
        .cause,
    ).toEqual({
      kind: "limit_reached",
      code: "harness.max-minutes",
      detail: { limit: "10", used: "10" },
    });
    expect(ports.steps.slice(-3)).toEqual(["harness.cancel", "session.close", "bridge.close"]);
    expect(stillOpen(ports.steps)).toBe(0);
  });

  it("sets the timer for maxMinutes from the harness's start, and cancels it when the step ends", async () => {
    const ports = harnessPorts();
    ports.harness.events = [finished("Done")];
    const { limits, scheduler } = startLimits();

    const { output } = await runCallOn(
      ports,
      limits,
      undefined,
      undefined,
      limitedCall({ maxMinutes: 10 }),
    );

    expect(output).toBe("Done");
    expect(await scheduler.waitFor("run_1", "start:step:call-1")).toMatchObject({ key: "run_1" });
    expect(scheduler.timers.size).toBe(0);
  });

  it("cancels the maxMinutes timer when the harness fails to start", async () => {
    const ports = harnessPorts();
    ports.harness.start = () => {
      throw new Error("No such program.");
    };
    const { limits, scheduler } = startLimits();

    const { error } = await runCallOn(
      ports,
      limits,
      undefined,
      undefined,
      limitedCall({ maxMinutes: 10 }),
    );

    expect((error as Error).message).toBe("No such program.");
    expect(await scheduler.waitFor("run_1", "start:step:call-1")).toMatchObject({ key: "run_1" });
    expect(scheduler.timers.size).toBe(0);
  });

  it("doesn't count the time a person takes to answer", async () => {
    const ports = harnessPorts();
    ports.harness.events = [
      { type: "approval.requested", agent: "writer", callId: "toolu_7", tool: "Bash", args: {} },
      finished("Done"),
    ];
    const { limits, scheduler } = startLimits();
    const timersWhileAsked: string[] = [];
    const approvals = {
      ask: async () => {
        timersWhileAsked.push(...[...scheduler.timers.values()].map((timer) => timer.timerId));
        return { approved: true };
      },
    };

    const { output } = await runCallOn(
      ports,
      limits,
      undefined,
      approvals,
      limitedCall({ maxMinutes: 10 }),
    );

    expect(output).toBe("Done");
    expect(timersWhileAsked).not.toContain("start:step:call-1");
  });

  it("doesn't bound a step with the agent's own maxSteps, nor at all without harnessLimits", async () => {
    const { ports, refused, recorded } = programRecording(
      Array.from({ length: 10 }, () => request),
    );
    ports.harness.hangs = false;
    ports.harness.events = [finished("Done")];
    const { scheduler, limits } = startLimits();

    const { output } = await runCallOn(ports, limits, undefined, undefined, limitedCall());
    await recorded;

    expect(writerCall.agent.maxSteps).toBe(6);
    expect(output).toBe("Done");
    expect(refused).toEqual([]);
    expect(scheduler.timers.size).toBe(0);
  });
});
