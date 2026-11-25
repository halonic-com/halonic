// A scope delete's erase of the usage object (see `usage-erase.test.ts`).

import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { UsageObject } from "../usage-object.ts";

export { UsageObject };

/** What the runner binds for this suite. */
interface TestEnv {
  USAGE: DurableObjectNamespace<UsageObject>;
}

const acme = { actor: "u_acme", scope: "u/acme" };

describe("UsageObject erase", () => {
  it("erases nothing while rows wait for Cloud, and says how many", async () => {
    const { USAGE } = env as unknown as TestEnv;
    const usage = USAGE.get(USAGE.idFromName(acme.scope));
    await usage.record(acme, "call_1", "run_1", "model_call", { cost: 5 });
    await usage.record(acme, "call_2", "run_1", "model_call", { cost: 7 });
    expect(await usage.eraseIfSent(acme.scope)).toEqual({ unsent: 2 });
    expect(await usage.outboxSize(acme.scope)).toBe(2);
  });

  it("erases an object never used, twice, without noting its scope", async () => {
    const { USAGE } = env as unknown as TestEnv;
    const usage = USAGE.get(USAGE.idFromName("o/acme-unused"));
    expect(await usage.eraseIfSent("o/acme-unused")).toEqual({ unsent: 0 });
    expect(await usage.eraseIfSent("o/acme-unused")).toEqual({ unsent: 0 });
    await expect(usage.eraseIfSent("o/acme-other")).rejects.toThrow(/named for another scope/);
  });
});
