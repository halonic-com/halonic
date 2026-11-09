import { type RunEvent, type RunEventBody, summarize } from "@halonicjs/events";
import {
  type BridgeProviderAccess,
  bridgeCallCost,
  type ChatResponse,
  ModelCallError,
} from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { call, callAnswer, ScriptedModel, textAnswer } from "../testing/scripted-model.ts";
import { callCost } from "./call-cost.ts";
import { runModelTurn } from "./run-model-turn.ts";
import {
  MemoryTurnLog,
  runTestTurn,
  secretsWith,
  steppingClock,
} from "./turn-test-kit.test-helper.ts";

/** An answer with a million input and half a million output tokens. */
const bigAnswer: ChatResponse = {
  ...textAnswer("Done"),
  usage: { inputTokens: 1_000_000, outputTokens: 500_000 },
};

const price = { input: 2, output: 8 };

/** The costs of a turn's `llm.response` events; `undefined` where it has none. */
async function costsOf(setup: Parameters<typeof runTestTurn>[0]) {
  const log = new MemoryTurnLog();
  await runTestTurn({ ...setup, log });
  return log.events.flatMap((event) => (event.type === "llm.response" ? [event.cost] : []));
}

/** The summary of a run whose only events are those of the turn. */
function summaryOf(log: MemoryTurnLog) {
  const started: RunEventBody = {
    type: "run.started",
    hubId: "default",
    workflowId: "agent:clerk",
    input: {},
    kind: "run",
    definitionsVersion: "v1",
  };
  const events: RunEvent[] = [started, ...log.events].map((event, index) => ({
    ...event,
    runId: "run_1",
    seq: index + 1,
    at: "2026-01-05T09:00:00.000Z",
  }));
  return summarize(events);
}

verifies("engine.turn-prices-calls", () => {
  it("prices a call at the model's price per million tokens", async () => {
    expect(await costsOf({ answers: [bigAnswer], pricing: { price } })).toEqual([6]);
  });

  it("doesn't round the cost", () => {
    const usage = { inputTokens: 1, outputTokens: 3 };
    const cost = callCost({ provider: new ScriptedModel([]), model: "m", price }, usage);
    expect(cost).toBe(0.000026);
  });

  it("gives a call exactly the cost the bridge gives it", () => {
    const usage = { inputTokens: 1_000, outputTokens: 500 };
    const price = { input: 3, output: 15 };
    const keyed: BridgeProviderAccess = { kind: "key", secret: "anthropic-key" };
    const cost = callCost({ provider: new ScriptedModel([]), model: "m", price }, usage);

    expect(cost).toBe(bridgeCallCost(keyed, price, usage));
    expect(cost).toBe(0.0105);
  });

  it("gives a local model without a price a cost of 0", async () => {
    expect(await costsOf({ answers: [bigAnswer], pricing: { local: true } })).toEqual([0]);
  });

  it("prices a local model that has a price", async () => {
    expect(await costsOf({ answers: [bigAnswer], pricing: { local: true, price } })).toEqual([6]);
  });

  it("leaves the cost out for a model that is neither priced nor local", async () => {
    const log = new MemoryTurnLog();
    await runTestTurn({ answers: [bigAnswer], log });

    expect(log.events.at(-1)).not.toHaveProperty("cost");
    expect(summaryOf(log)).toMatchObject({ cost: 0, unpricedCalls: 1 });
  });

  it("prices a call by the model that answered it", async () => {
    const log = new MemoryTurnLog();
    const offline = new ScriptedModel([new ModelCallError("offline", "smart is offline")], "cloud");
    await runModelTurn({
      model: {
        provider: offline,
        model: "smart-1",
        price,
        fallback: [
          { provider: new ScriptedModel([bigAnswer], "local"), model: "small-1", local: true },
        ],
      },
      secrets: secretsWith(),
      messages: [{ role: "user", content: "Hello" }],
      callerTools: [],
      halonicTools: [],
      connectors: [],
      maxRounds: 1,
      agent: "clerk",
      clock: steppingClock(),
      log,
    });

    expect(log.events.at(-1)).toMatchObject({ type: "llm.response", provider: "local", cost: 0 });
  });

  it("counts no call of a run on the mock model as unpriced", async () => {
    const log = new MemoryTurnLog();
    await runTestTurn({
      answers: [callAnswer(call("c1", "missing")), textAnswer("Done")],
      provider: "mock",
      pricing: { local: true },
      log,
    });

    expect(summaryOf(log)).toMatchObject({
      usage: { inputTokens: 20, outputTokens: 10 },
      cost: 0,
      unpricedCalls: 0,
    });
  });
});
