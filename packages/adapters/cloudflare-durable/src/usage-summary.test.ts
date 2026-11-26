import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { acmeLimits, openAccount, period, step } from "./test/usage-case.ts";

const owner = { runId: "run_1", actor: "u_acme" };
const starter = { id: "starter", version: 1, name: "Starter" };

verifies("cloudflare-durable.usage-summary", () => {
  it("names the plan and the share of the cost limit spent, rounded down", () => {
    const { account } = openAccount(acmeLimits({ plan: starter }));
    account.record("call_1", owner, "model_call", { cost: 625 });
    expect(account.summary()).toEqual({
      planName: "Starter",
      costPercent: 62,
      periodEnd: period.end,
      units: [{ unit: "cost", percent: 62 }],
    });
  });

  it("gives each limited unit's percent, rounded down, at most 100, and 100 for a limit of 0", () => {
    const limits = { runs: 10, steps: 0, cost: 1_000, harnessMs: 1_000 };
    const { account } = openAccount(acmeLimits({ limits }));
    account.record("call_1", owner, "model_call", { cost: 1_500, tokens: 50 });
    account.record("run_1", owner, "run", { harnessMs: 829 });
    expect(account.summary().units).toEqual([
      { unit: "runs", percent: 0 },
      { unit: "steps", percent: 100 },
      { unit: "cost", percent: 100 },
      { unit: "harnessMs", percent: 82 },
    ]);
  });

  it("stops at 100 past the limit, and reads 100 for a cost limit of 0", () => {
    const { account } = openAccount(acmeLimits({ plan: starter }));
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
    expect(account.summary()).toEqual({
      planName: null,
      costPercent: null,
      periodEnd: period.end,
      units: [{ unit: "runs", percent: 0 }],
    });
  });

  it("is all null while the account knows no limits", () => {
    const { account } = openAccount(null);
    expect(account.summary()).toEqual({
      planName: null,
      costPercent: null,
      periodEnd: null,
      units: [],
    });
  });

  it("is all null once the kept period has ended, until the next one arrives", () => {
    const { account, clock } = openAccount(acmeLimits({ plan: starter }));
    account.record("call_1", owner, "model_call", { cost: 1_000 });
    clock.nowMs = period.end - 1;
    expect(account.summary().costPercent).toBe(100);
    clock.nowMs = period.end;
    expect(account.summary()).toEqual({
      planName: null,
      costPercent: null,
      periodEnd: null,
      units: [],
    });
    const nextPeriod = { start: period.end, end: Date.UTC(2027, 0, 1) };
    account.applyLimits(acmeLimits({ version: 2, plan: starter, period: nextPeriod }));
    expect(account.summary()).toEqual({
      planName: "Starter",
      costPercent: 0,
      periodEnd: nextPeriod.end,
      units: [{ unit: "cost", percent: 0 }],
    });
  });

  it("refuses a document whose plan name is blank, too long, not text or has control characters", () => {
    const { account } = openAccount();
    const wrong = [" ", "x".repeat(201), 42 as unknown as string, "Pro\n", "Pro\u200b"];
    for (const name of wrong) {
      const plan = { ...starter, name };
      expect(() => account.applyLimits(acmeLimits({ version: 2, plan }))).toThrow(RangeError);
    }
    const longest = "x".repeat(200);
    const plan = { ...starter, name: longest };
    expect(account.applyLimits(acmeLimits({ version: 2, plan }))).toBe("applied");
    expect(account.summary().planName).toBe(longest);
  });
});
