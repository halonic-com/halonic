import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { acmeLimits, openAccount, period, step } from "./test/usage-case.ts";

const owner = { runId: "run_1", actor: "u_acme" };

verifies("cloudflare-durable.usage-summary", () => {
  it("names the plan and the share of the cost limit spent, rounded down", () => {
    const { account } = openAccount(acmeLimits({ planName: "Starter" }));
    account.record("call_1", owner, "model_call", { cost: 625 });
    expect(account.summary()).toEqual({
      planName: "Starter",
      costPercent: 62,
      periodEnd: period.end,
    });
  });

  it("stops at 100 past the limit, and reads 100 for a cost limit of 0", () => {
    const { account } = openAccount(acmeLimits({ planName: "Starter" }));
    account.record("call_1", owner, "model_call", { cost: 1_200 });
    expect(account.summary().costPercent).toBe(100);
    const empty = openAccount(acmeLimits({ limits: { cost: 0 } })).account;
    expect(empty.summary().costPercent).toBe(100);
  });

  it("counts only what was charged, not what a running step holds", () => {
    const { account } = openAccount();
    expect(account.reserve(step("res_1", { cost: 300 }))).toEqual({ allowed: true });
    expect(account.summary().costPercent).toBe(0);
  });

  it("has no percent without a cost limit, and no name without one from Cloud", () => {
    const { account } = openAccount(acmeLimits({ limits: { runs: 10 } }));
    expect(account.summary()).toEqual({ planName: null, costPercent: null, periodEnd: period.end });
  });

  it("is all null while the account knows no limits", () => {
    const { account } = openAccount(null);
    expect(account.summary()).toEqual({ planName: null, costPercent: null, periodEnd: null });
  });

  it("refuses a document whose plan name is empty, too long or not text", () => {
    const { account } = openAccount();
    const wrong = [" ", "x".repeat(201), 42 as unknown as string];
    for (const planName of wrong) {
      expect(() => account.applyLimits(acmeLimits({ version: 2, planName }))).toThrow(RangeError);
    }
    const longest = "x".repeat(200);
    expect(account.applyLimits(acmeLimits({ version: 2, planName: longest }))).toBe("applied");
    expect(account.summary().planName).toBe(longest);
  });
});
