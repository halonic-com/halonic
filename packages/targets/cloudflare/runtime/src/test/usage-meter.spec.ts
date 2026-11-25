/**
 * `UsageObjectMeter` over a real `UsageObject`, inside workerd: the Meter suite every backend
 * passes, then what only this meter promises. Run by `usage-meter.test.ts`.
 */

import { env } from "cloudflare:workers";
import { type UsageLimits, UsageObject } from "@halonicjs/adapter-cloudflare-durable";
import {
  type MeterUsage,
  modelCallUsageOf,
  type RunState,
  runEndUsageOf,
  type StepTimes,
} from "@halonicjs/engine";
import {
  acmeOrganisationId,
  acmeRunId,
  ada,
  bea,
  type MeterPlan,
  type MeterPlanAmounts,
  type MeterUsageMakers,
  meterContract,
  meterResetsAt,
  meterStart,
} from "@halonicjs/testing-contracts";
import { describe, expect, it } from "vitest";
import { UsageObjectMeter } from "../usage-meter.ts";
import { costBase, minuteBase } from "../usage-stops.ts";

const clockKey = "test:clock-ms";

/** The usage object, with a time the spec sets, and its alarm callable. */
export class ClockedUsageObject extends UsageObject {
  constructor(ctx: DurableObjectState, objectEnv: Cloudflare.Env) {
    super(ctx, objectEnv);
    this.clock = { now: () => new Date(ctx.storage.kv.get<number>(clockKey) ?? 0) };
  }

  /** Forgets everything the case before kept, and sets the time. */
  async startCase(nowMs: number): Promise<void> {
    await this.ctx.storage.deleteAll();
    this.ctx.storage.kv.put(clockKey, nowMs);
  }

  setNow(nowMs: number): void {
    this.ctx.storage.kv.put(clockKey, nowMs);
  }

  runAlarm(): Promise<void> {
    return this.alarm();
  }
}

interface TestEnv {
  USAGE: DurableObjectNamespace<ClockedUsageObject>;
}

const scope = `o/${acmeOrganisationId}`;

function usageObject() {
  const { USAGE } = env as unknown as TestEnv;
  return USAGE.get(USAGE.idFromName(scope));
}

let calls = 0;

/** The engine's own makers; each model call gets a call id of its own. */
const usage: MeterUsageMakers<MeterUsage, StepTimes> = {
  modelCall: (cost, options = {}) => {
    calls += 1;
    return modelCallUsageOf({
      type: "llm.response",
      agent: "writer",
      provider: "acme-ai",
      model: "acme-1",
      usage: { inputTokens: 1000, outputTokens: 200 },
      latencyMs: 5,
      text: "",
      runId: acmeRunId,
      seq: calls,
      at: meterStart.toISOString(),
      cost,
      ...(options.cached === undefined ? {} : { cached: options.cached }),
    });
  },
  // Only the run's id and status are read.
  runEnd: (runId, status) => runEndUsageOf({ runId, status } as RunState),
  // The engine makes these from its clock; the suite only needs the amounts.
  stepTimes: (harnessMs) => ({ wallMs: harnessMs, harnessMs }) as StepTimes,
};

/** The plan's amounts in the object's units. */
function amountsOf(amounts: MeterPlanAmounts = {}) {
  const { harnessMinutes, cost, ...counts } = amounts;
  return {
    ...counts,
    ...(cost === undefined ? {} : { cost: cost * costBase }),
    ...(harnessMinutes === undefined ? {} : { harnessMs: harnessMinutes * minuteBase }),
  };
}

/** The acme organisation's limits as Cloud sends them, for November 2026. */
function limitsOf(plan: MeterPlan): UsageLimits {
  const beaShare = plan.beaShare === undefined ? {} : { shares: amountsOf(plan.beaShare) };
  return {
    version: 1,
    status: "active",
    period: { start: Date.UTC(2026, 10, 1), end: Date.parse(meterResetsAt) },
    limits: amountsOf(plan.pool),
    defaultReserve: {},
    maxRunning: plan.concurrency ?? 1_000,
    members: {
      [ada.actor]: { status: "active" },
      [bea.actor]: { status: "active", ...beaShare },
    },
  };
}

/** A meter for `topRunId` over the acme object, emptied and given `plan`. */
async function makeMeter(plan: MeterPlan, topRunId = acmeRunId) {
  const object = usageObject();
  await object.startCase(meterStart.getTime());
  expect(await object.applyLimits(scope, limitsOf(plan))).toBe("applied");
  let made = 0;
  const ids = { next: (prefix: string) => `${prefix}${++made}` };
  const meter = new UsageObjectMeter({ objectOf: () => usageObject(), topRunId, ids });
  return { meter, object };
}

meterContract("UsageObjectMeter", async (plan) => {
  const { meter, object } = await makeMeter(plan);
  const clock = {
    at: meterStart.getTime(),
    now: () => new Date(clock.at),
    advance: (ms: number) => {
      clock.at += ms;
    },
  };
  return {
    meter,
    usage,
    clock,
    startRun: async (principal, runId) => {
      expect(await object.startRun(principal, runId)).toEqual({ allowed: true });
    },
  };
});

describe("UsageObjectMeter", () => {
  it("counts a run's end once, however often it is recorded, and frees its slot", async () => {
    const { meter, object } = await makeMeter({ pool: { runs: 2 }, concurrency: 1 });
    await object.startRun(ada, "run_acme_1");
    await meter.record(ada, usage.runEnd("run_acme_1", "completed"));
    await meter.record(ada, usage.runEnd("run_acme_1", "completed"));
    expect(await meter.check(ada, { kind: "run-start" })).toEqual({ allowed: true });
  });

  it("counts a call's cost once when its step's reservation ran out and settles late", async () => {
    const { meter, object } = await makeMeter({ pool: { cost: 10 } });
    const held = await meter.reserve(ada, { cost: 6, minutes: 1 });
    if (!held.allowed) throw new Error("The step should have been allowed.");
    await meter.record(ada, usage.modelCall(4));
    await object.setNow(meterStart.getTime() + 10 * minuteBase);
    await object.runAlarm();
    await meter.settle(held.reservation, usage.stepTimes(0));
    const refused = await meter.reserve(ada, { cost: 7 });
    expect(refused).toMatchObject({ stop: { cause: { detail: { needed: "7", left: "6" } } } });
  });

  it("names the object's load limit with its own code, not a plan's", async () => {
    const { meter } = await makeMeter({ pool: { cost: 10 } });
    let answer = await meter.check(ada, { kind: "model-call" });
    for (let count = 0; answer.allowed && count < 200; count += 1) {
      answer = await meter.check(ada, { kind: "model-call" });
    }
    expect(answer).toMatchObject({
      allowed: false,
      stop: { cause: { kind: "limit_reached", code: "usage.member.rate" } },
    });
  });
});
