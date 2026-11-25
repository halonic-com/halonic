// `ConfigMeter` is the Meter suite's reference backend: every other meter is held to what it does.

import type { UsageLimit } from "@halonicjs/format";
import type { Coordination } from "@halonicjs/ports";
import {
  acmeMembers,
  acmeOrganisationId,
  acmeRunId,
  bea,
  type MeterPlan,
  type MeterPlanAmounts,
  type MeterUsageMakers,
  meterContract,
  meterStart,
} from "@halonicjs/testing-contracts";
import type { RunState } from "../kernel/run-state.ts";
import { ConfigMeter, type RunningRuns } from "./config-meter.ts";
import type { MeterUsage, StepTimes } from "./meter.ts";
import { modelCallUsageOf, runEndUsageOf } from "./metered-usage.ts";

/** The value part of `Coordination` in memory: all the meter uses. */
class MemoryValues implements Pick<Coordination, "read" | "compareAndSet"> {
  readonly #values = new Map<string, string>();

  async read(key: string): Promise<string | null> {
    return this.#values.get(key) ?? null;
  }

  async compareAndSet(key: string, expected: string | null, next: string | null): Promise<boolean> {
    if ((this.#values.get(key) ?? null) !== expected) return false;
    if (next === null) this.#values.delete(key);
    else this.#values.set(key, next);
    return true;
  }
}

/** The engine's own makers, as the suite asks for them. */
const usage: MeterUsageMakers<MeterUsage, StepTimes> = {
  modelCall: (cost, options = {}) =>
    modelCallUsageOf({
      type: "llm.response",
      agent: "writer",
      provider: "acme-ai",
      model: "acme-1",
      usage: { inputTokens: 1000, outputTokens: 200 },
      latencyMs: 5,
      text: "",
      runId: acmeRunId,
      seq: 2,
      at: meterStart.toISOString(),
      cost,
      ...(options.cached === undefined ? {} : { cached: options.cached }),
    }),
  // Only the run's id and status are read.
  runEnd: (runId, status) => runEndUsageOf({ runId, status } as RunState),
  // The engine makes these from its clock; the suite only needs the amounts.
  stepTimes: (harnessMs) => ({ wallMs: harnessMs, harnessMs }) as StepTimes,
};

/** The plan's amounts as the file's monthly `stop` limits. */
function monthlyLimits(amounts: MeterPlanAmounts = {}): UsageLimit[] {
  return Object.entries(amounts).map(([unit, amount]) => ({
    unit: unit as UsageLimit["unit"],
    amount,
    period: "month",
    action: "stop",
  }));
}

/** The acme organisation as a `users.config` file writes it. */
function organisationOf(plan: MeterPlan) {
  const members = acmeMembers.map((principal) => ({
    actor: principal.actor,
    role: principal.role,
    ...(principal === bea && plan.beaShare !== undefined
      ? { limits: monthlyLimits(plan.beaShare) }
      : {}),
  }));
  return {
    id: acmeOrganisationId,
    limits: monthlyLimits(plan.pool),
    members,
    ...(plan.concurrency === undefined ? {} : { concurrency: plan.concurrency }),
  };
}

meterContract("ConfigMeter", async (plan) => {
  const clock = {
    at: meterStart.getTime(),
    now: () => new Date(clock.at),
    advance: (ms: number) => {
      clock.at += ms;
    },
  };
  let made = 0;
  const ids = {
    next: (prefix: string) => {
      made += 1;
      return `${prefix}${made}`;
    },
  };
  const going: { scope: string; actor: string }[] = [];
  const running: RunningRuns = {
    count: async (scope, actor) => ({
      scope: going.filter((run) => run.scope === scope).length,
      actor: going.filter((run) => run.scope === scope && run.actor === actor).length,
    }),
  };
  const meter = new ConfigMeter({
    settings: { limits: [], organisations: [organisationOf(plan)] },
    coordination: new MemoryValues(),
    clock,
    ids,
    running,
  });
  return {
    meter,
    usage,
    clock,
    startRun: async (principal) => {
      going.push({ scope: principal.scope, actor: principal.actor });
    },
  };
});
