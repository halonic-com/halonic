/**
 * The account menu's figures from a real `UsageObject`, inside workerd. Run by
 * `account-usage.test.ts`.
 */

import { env } from "cloudflare:workers";
import type { UsageLimits } from "@halonicjs/adapter-cloudflare-durable";
import { checkClaims, type Principal } from "@halonicjs/host-server";
import { describe, expect, it } from "vitest";
import { createAccountUsage } from "../account-usage.ts";
import type { RuntimeEnv } from "../env.ts";

export { UsageObject } from "../index.ts";

/** The principal of a made-up personal scope. */
function principalOf(id: string): Principal {
  const session = checkClaims({ aud: "app", sub: id, scope: `u/${id}` });
  if (session === null) throw new Error("The test's claims were refused.");
  return session.principal;
}

/** A Pro plan with a cost limit of 1,000, for a day from now. */
function proLimits(): UsageLimits {
  const start = Date.now();
  return {
    version: 1,
    status: "active",
    period: { start, end: start + 24 * 60 * 60 * 1000 },
    limits: { cost: 1_000 },
    defaultReserve: { cost: 100 },
    maxRunning: 1,
    plan: { id: "pro", version: 1, name: "Pro" },
  };
}

function usageOf(scope: string) {
  const { USAGE } = env as unknown as Required<Pick<RuntimeEnv, "USAGE">>;
  return USAGE.get(USAGE.idFromName(scope));
}

describe("the account menu's usage", () => {
  it("answers the plan's name and the share of its cost limit spent", async () => {
    const principal = principalOf("eu_acme0000000000001");
    const usage = usageOf("u/eu_acme0000000000001");
    const limits = proLimits();
    await usage.applyLimits("u/eu_acme0000000000001", limits);
    const ada = { actor: principal.actor, scope: "u/eu_acme0000000000001" };
    await usage.record(ada, "call_1", "run_1", "model_call", { cost: 425 });
    const accountUsage = createAccountUsage(env as unknown as RuntimeEnv);
    const resetsAt = new Date(limits.period.end).toISOString();
    expect(await accountUsage?.(principal)).toEqual({
      plan: "Pro",
      usedPercent: 42,
      units: [{ unit: "cost", percent: 42, resetsAt }],
    });
  });

  it("answers no plan and no percent for a scope with no limits", async () => {
    const accountUsage = createAccountUsage(env as unknown as RuntimeEnv);
    const principal = principalOf("eu_acme0000000000002");
    expect(await accountUsage?.(principal)).toEqual({ plan: null, usedPercent: null, units: [] });
  });
});
