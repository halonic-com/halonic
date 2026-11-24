// The usage object as the Worker binds it: its methods over RPC, under its own class name.

import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { UsageObject } from "../usage-object.ts";

export { UsageObject };

/** What the runner binds for this suite (see `usage-object.test.ts`). */
interface TestEnv {
  USAGE: DurableObjectNamespace<UsageObject>;
}

const acme = { actor: "u_acme", scope: "u/acme" };

describe("UsageObject", () => {
  it("refuses a step until it is given limits, then holds it", async () => {
    const { USAGE } = env as unknown as TestEnv;
    const usage = USAGE.get(USAGE.idFromName(acme.scope));
    expect(await usage.check(acme)).toEqual({ allowed: false, refusal: { code: "plan.none" } });
    const start = Date.now();
    const limits = {
      version: 1,
      status: "active" as const,
      period: { start, end: start + 24 * 60 * 60 * 1000 },
      limits: { cost: 1_000 },
      defaultReserve: { cost: 100 },
      maxRunning: 1,
    };
    expect(await usage.applyLimits(acme.scope, limits)).toBe("applied");
    const step = { id: "res_1", runId: "run_1", max: {}, timeLimitMs: 60_000 };
    expect(await usage.reserve(acme, step)).toEqual({ allowed: true });
    expect(await usage.settle(acme.scope, "res_1", { cost: 40 })).toBe("settled");
    expect(await usage.startRun(acme, "run_1")).toEqual({ allowed: true });
    expect(await usage.renewRun(acme, "run_1")).toEqual({ allowed: true });
    await usage.record(acme, "call_1", "run_1", "model_call", { cost: 5 });
    await usage.stopRunning(acme.scope, "run_1");
    expect(await usage.outboxSize(acme.scope)).toBe(2);
  });

  it("refuses a call for a scope other than the one it is named for", async () => {
    const { USAGE } = env as unknown as TestEnv;
    const usage = USAGE.get(USAGE.idFromName("u/acme-named"));
    await expect(usage.check({ actor: "u_acme", scope: "o/acme" })).rejects.toThrow(
      /named for another scope/,
    );
  });
});
