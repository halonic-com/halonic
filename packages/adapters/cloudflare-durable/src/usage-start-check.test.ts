import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { openAccount } from "./test/usage-case.ts";

verifies("cloudflare-durable.usage-start-check", () => {
  it("refuses a run start's check at the cap, and still allows a step's", () => {
    const { account } = openAccount();
    account.startRun("run_1", "u_acme");
    account.startRun("run_2", "u_acme");
    expect(account.check("u_acme", { runStart: true })).toEqual({
      allowed: false,
      refusal: { code: "plan.concurrency", running: 2, limit: 2 },
    });
    expect(account.check("u_acme")).toEqual({ allowed: true });
  });

  it("takes no slot for a run start's check", () => {
    const { account } = openAccount();
    account.startRun("run_1", "u_acme");
    expect(account.check("u_acme", { runStart: true })).toEqual({ allowed: true });
    expect(account.check("u_acme", { runStart: true })).toEqual({ allowed: true });
    expect(account.startRun("run_2", "u_acme")).toEqual({ allowed: true });
  });
});
