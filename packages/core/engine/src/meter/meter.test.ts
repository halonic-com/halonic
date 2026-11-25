import { summarize } from "@halonicjs/events";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import type { RunState } from "../kernel/run-state.ts";
import type { MeterPrincipal } from "./meter.ts";
import {
  type LoggedModelResponse,
  modelCallUsageOf,
  runEndUsageOf,
  stepTimesOf,
} from "./metered-usage.ts";
import { NoMeter } from "./no-meter.ts";

const principal: MeterPrincipal = { actor: "u/ada", scope: "o/acme", role: "member" };

function response(fields: Partial<LoggedModelResponse>): LoggedModelResponse {
  return {
    type: "llm.response",
    agent: "writer",
    provider: "acme-ai",
    model: "acme-1",
    usage: { inputTokens: 1000, outputTokens: 200 },
    latencyMs: 5,
    text: "",
    runId: "r-acme",
    seq: 2,
    at: "2026-11-22T10:00:00.000Z",
    ...fields,
  };
}

/** What a run's summary counts for the response alone. */
function summaryCost(logged: LoggedModelResponse): number | undefined {
  const started = {
    type: "run.started",
    hubId: "acme",
    workflowId: "reply",
    input: {},
    kind: "run",
    definitionsVersion: "v1",
    runId: "r-acme",
    seq: 1,
    at: logged.at,
  } as const;
  return summarize([started, logged])?.cost;
}

verifies("engine.meter-port", () => {
  describe("a model call's usage", () => {
    it("is the logged response's tokens and cost", () => {
      const usage = modelCallUsageOf(response({ cost: 0.006 }));
      expect(usage).toEqual({
        kind: "model_call",
        runId: "r-acme",
        callId: "r-acme:2",
        model: "acme-ai/acme-1",
        usage: { inputTokens: 1000, outputTokens: 200 },
        cost: 0.006,
        counted: "priced",
      });
    });

    it("costs what the run's summary counts: nothing for a subscription, an unpriced or a cached call", () => {
      const calls = [
        response({ cost: 0.006 }),
        response({ cost: 0.5, paidBy: "subscription" }),
        response({}),
        response({ cost: 0.25, cached: true }),
      ];
      for (const call of calls) {
        expect(modelCallUsageOf(call).cost).toBe(summaryCost(call));
      }
      expect(modelCallUsageOf(calls[1] as LoggedModelResponse).counted).toBe("subscription");
      expect(modelCallUsageOf(calls[3] as LoggedModelResponse)).toMatchObject({
        usage: null,
        counted: "cached",
      });
    });
  });

  it("times a step by the engine's clock", () => {
    const clock = { now: () => new Date("2026-11-22T10:01:30.000Z") };
    const times = stepTimesOf(
      clock,
      new Date("2026-11-22T10:00:00.000Z"),
      new Date("2026-11-22T10:00:30.000Z"),
    );
    expect(times).toEqual({ wallMs: 90_000, harnessMs: 60_000 });
    expect(stepTimesOf(clock, new Date("2026-11-22T10:00:00.000Z"), null).harnessMs).toBe(0);
  });

  it("counts a run's end only once it has ended", () => {
    const ended = { runId: "r-acme", status: "completed" } as RunState;
    expect(runEndUsageOf(ended)).toEqual({ kind: "run", runId: "r-acme", status: "completed" });
    const running = { runId: "r-acme", status: "running" } as RunState;
    expect(() => runEndUsageOf(running)).toThrow(
      `Run "r-acme" hasn't ended, so its end can't be counted.`,
    );
  });

  it("takes no usage a step wrote itself", async () => {
    const meter = new NoMeter();
    const written = {
      kind: "model_call",
      runId: "r-acme",
      model: "acme-ai/acme-1",
      usage: null,
      cost: 0,
      counted: "cached",
    } as const;
    // The type errors are the test (tsconfig.test.json checks them); NoMeter
    // still takes the calls without throwing.
    // @ts-expect-error: only the engine makes what the meter counts.
    const recorded = meter.record(principal, written);
    // @ts-expect-error: a step's times come from the engine's clock.
    const settled = meter.settle({ id: "none", principal }, { wallMs: 0, harnessMs: 0 });
    await expect(Promise.all([recorded, settled])).resolves.toHaveLength(2);
  });

  it("allows everything with NoMeter", async () => {
    const meter = new NoMeter();
    for (const kind of ["run-start", "model-call", "harness-run"] as const) {
      expect(await meter.check(principal, { kind })).toEqual({ allowed: true });
    }
    const reserved = await meter.reserve(principal, { cost: 2, minutes: 30, steps: 100 });
    expect(reserved).toEqual({ allowed: true, reservation: { id: "none", principal } });
  });
});

verifies("engine.meter-call-id", () => {
  it("names a model call by its run and its place in the run log", () => {
    expect(modelCallUsageOf(response({ runId: "r-acme", seq: 7 })).callId).toBe("r-acme:7");
  });

  it("gives the same call the same id each time, and other calls other ids", () => {
    const logged = response({ seq: 7, cost: 0.006 });
    expect(modelCallUsageOf(logged).callId).toBe(modelCallUsageOf({ ...logged }).callId);
    const ids = new Set([
      modelCallUsageOf(response({ runId: "r-acme", seq: 7 })).callId,
      modelCallUsageOf(response({ runId: "r-acme", seq: 9 })).callId,
      modelCallUsageOf(response({ runId: "r-acme-child", seq: 7 })).callId,
    ]);
    expect(ids.size).toBe(3);
  });
});
