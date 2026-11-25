// `ConfigMeter` is the reference backend: it runs the Meter suite here rather than in the engine's
// own tests, since the suite imports the engine and the engine can't import the suite back.

import { ConfigMeter, type RunningRuns } from "@halonicjs/engine";
import type { UsageLimit } from "@halonicjs/format";
import type { Coordination } from "@halonicjs/ports";
import { meterContract } from "./meter.ts";
import {
  acmeMembers,
  acmeOrganisationId,
  bea,
  type MeterPlan,
  type MeterPlanAmounts,
  meterStart,
} from "./meter-harness.ts";

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

/** The plan's amounts as the file's monthly `stop` limits. */
function monthlyLimits(amounts: MeterPlanAmounts = {}): UsageLimit[] {
  return Object.entries(amounts).map(([unit, amount]) => ({
    unit: unit as UsageLimit["unit"],
    amount,
    period: "month",
    action: "stop",
  }));
}

meterContract("ConfigMeter", async (plan: MeterPlan) => {
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
  const members = acmeMembers.map((principal) => ({
    actor: principal.actor,
    role: principal.role,
    ...(principal === bea && plan.beaShare !== undefined
      ? { limits: monthlyLimits(plan.beaShare) }
      : {}),
  }));
  const organisation = {
    id: acmeOrganisationId,
    limits: monthlyLimits(plan.pool),
    members,
    ...(plan.concurrency === undefined ? {} : { concurrency: plan.concurrency }),
  };
  const meter = new ConfigMeter({
    settings: { limits: [], organisations: [organisation] },
    coordination: new MemoryValues(),
    clock,
    ids,
    running,
  });
  return {
    meter,
    clock,
    startRun: async (principal) => {
      going.push({ scope: principal.scope, actor: principal.actor });
    },
  };
});
