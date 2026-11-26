// The usage object's summary for the account menu, over RPC (see `usage-summary-object.test.ts`).

import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { UsageObject } from "../usage-object.ts";
import type { UsageLimits } from "../usage-types.ts";

export { UsageObject };

/** What the runner binds for this suite. */
interface TestEnv {
  USAGE: DurableObjectNamespace<UsageObject>;
}

function starterLimits(): UsageLimits {
  const start = Date.now();
  return {
    version: 1,
    status: "active",
    period: { start, end: start + 24 * 60 * 60 * 1000 },
    limits: { cost: 1_000 },
    defaultReserve: { cost: 100 },
    maxRunning: 1,
    plan: { id: "starter", version: 1, name: "Starter" },
  };
}

describe("UsageObject summary", () => {
  it("answers the plan's name and the share of the cost limit spent", async () => {
    const { USAGE } = env as unknown as TestEnv;
    const acme = { actor: "u_acme", scope: "u/acme-summary" };
    const usage = USAGE.get(USAGE.idFromName(acme.scope));
    const limits = starterLimits();
    await usage.applyLimits(acme.scope, limits);
    await usage.record(acme, "call_1", "run_1", "model_call", { cost: 625 });
    expect(await usage.summary(acme.scope)).toEqual({
      planName: "Starter",
      costPercent: 62,
      periodEnd: limits.period.end,
      units: [{ unit: "cost", percent: 62 }],
    });
  });

  it("is all null for an object never given limits, and notes no scope", async () => {
    const { USAGE } = env as unknown as TestEnv;
    // An unnamed object checks only the scope its first call noted, so a later call for another
    // scope shows whether the summary noted one.
    const usage = USAGE.get(USAGE.newUniqueId());
    expect(await usage.summary("u/acme-one")).toEqual({
      planName: null,
      costPercent: null,
      periodEnd: null,
      units: [],
    });
    expect(await usage.applyLimits("u/acme-two", starterLimits())).toBe("applied");
  });

  it("refuses a summary for a scope other than the one it is named for", async () => {
    const { USAGE } = env as unknown as TestEnv;
    const usage = USAGE.get(USAGE.idFromName("u/acme-named-summary"));
    await expect(usage.summary("u/other")).rejects.toThrow(/named for another scope/);
  });
});
