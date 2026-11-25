import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { CustomerLimitsError, customerLimitsOf, noRunCap } from "./customer-limits.ts";
import { scaledDecimal } from "./decimal-amount.ts";

const scope = "u/eu_acme0000000000000001";

/** A document as Cloud sends it for the acme customer: a monthly cost limit and runs limit. */
function acmeDocument(fields: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    endUserId: "eu_acme0000000000000001",
    version: 4,
    customer: "active",
    product: "live",
    plan: {
      state: "active",
      id: "plan_starter",
      version: 2,
      name: "Starter",
      periodStart: "2026-11-01T00:00:00.000Z",
      periodEnd: "2026-12-01T00:00:00.000Z",
    },
    limits: [
      limit({ unit: "cost", amount: "20.50", currency: "EUR", canUpgrade: true }),
      limit({ unit: "runs", amount: "100" }),
    ],
    overrides: [],
    ...fields,
  };
}

function limit(fields: Record<string, unknown>): Record<string, unknown> {
  return { period: "month", currency: null, action: "stop", canUpgrade: false, ...fields };
}

function refused(document: Record<string, unknown>): boolean {
  try {
    customerLimitsOf(document, scope);
    return false;
  } catch (error) {
    if (error instanceof CustomerLimitsError) return true;
    throw error;
  }
}

verifies("runtime.customer-limits", () => {
  describe("amounts", () => {
    it("reads a decimal string into whole units without rounding", () => {
      expect(scaledDecimal("20.50", 6)).toBe(20_500_000);
      expect(scaledDecimal("0.000001", 6)).toBe(1);
      expect(scaledDecimal("20.0000000", 0)).toBe(20);
      expect(scaledDecimal("9007199254.740991", 6)).toBe(Number.MAX_SAFE_INTEGER);
      for (const wrong of [
        "0.0000001",
        "-1",
        "1e3",
        "",
        " 1",
        "1.",
        ".5",
        "0x10",
        "9007199254.740992",
      ]) {
        expect(scaledDecimal(wrong, 6)).toBeNull();
      }
      expect(scaledDecimal(20, 6)).toBeNull();
    });

    it("keeps each unit in the object's smallest step", () => {
      const minutes = limit({ unit: "harnessMinutes", amount: "1.5" });
      const kept = customerLimitsOf(acmeDocument({ limits: [minutes] }), scope);
      expect(kept.limits).toEqual({ harnessMs: 90_000 });
      const both = customerLimitsOf(acmeDocument(), scope);
      expect(both.limits).toEqual({ cost: 20_500_000, runs: 100 });
    });

    it("refuses the whole document for an amount it would have to round, clamp or guess", () => {
      const wrongAmounts = ["0.0000001", "-1", "1e3", "9007199254.740992", 20];
      for (const amount of wrongAmounts) {
        const limits = [limit({ unit: "cost", amount, currency: "EUR" })];
        expect(refused(acmeDocument({ limits }))).toBe(true);
      }
      expect(refused(acmeDocument({ limits: [limit({ unit: "runs", amount: "1.5" })] }))).toBe(
        true,
      );
    });
  });

  describe("values it knows", () => {
    it("keeps the plan, its period and its upgrade offers", () => {
      const kept = customerLimitsOf(acmeDocument(), scope);
      expect(kept).toMatchObject({
        version: 4,
        status: "active",
        period: { start: Date.UTC(2026, 10, 1), end: Date.UTC(2026, 11, 1) },
        plan: { id: "plan_starter", version: 2, name: "Starter" },
        upgradable: ["cost"],
        defaultReserve: {},
        maxRunning: noRunCap,
      });
    });

    it("keeps trialing and past_due plans as sent", () => {
      for (const state of ["trialing", "past_due"]) {
        const plan = { ...(acmeDocument()["plan"] as object), state };
        expect(customerLimitsOf(acmeDocument({ plan }), scope).status).toBe("active");
      }
    });

    it("keeps a customer who isn't active as stopped, and a plan none as no plan", () => {
      for (const customer of ["suspended", "deleted"]) {
        expect(customerLimitsOf(acmeDocument({ customer }), scope).status).toBe("stopped");
      }
      const none = customerLimitsOf(acmeDocument({ plan: { state: "none" }, limits: [] }), scope);
      expect(none).toMatchObject({ status: "none", limits: {} });
      expect(none.plan).toBeUndefined();
    });

    it("keeps overrides with their end", () => {
      const overrides = [
        { unit: "cost", amount: "5", currency: "EUR", until: "2026-11-15T10:00:00Z" },
        { unit: "runs", amount: "10", currency: null, until: null },
      ];
      expect(customerLimitsOf(acmeDocument({ overrides }), scope).overrides).toEqual([
        { unit: "cost", amount: 5_000_000, until: Date.UTC(2026, 10, 15, 10) },
        { unit: "runs", amount: 10, until: null },
      ]);
    });

    it("refuses a value it can't keep instead of skipping it", () => {
      const plan = acmeDocument()["plan"] as Record<string, unknown>;
      const wrong = [
        { customer: "paused" },
        { plan: { ...plan, state: "canceled" } },
        { plan: { ...plan, periodEnd: "1 December" } },
        { plan: { ...plan, name: "Starter\n" } },
        { plan: { state: "none" } },
        { limits: [limit({ unit: "minutes", amount: "1" })] },
        { limits: [limit({ unit: "runs", amount: "1", period: "day" })] },
        { limits: [limit({ unit: "runs", amount: "1", action: "notify" })] },
        { limits: [limit({ unit: "runs", amount: "1", canUpgrade: "yes" })] },
        { limits: [limit({ unit: "runs", amount: "1" }), limit({ unit: "runs", amount: "2" })] },
        { limits: [limit({ unit: "cost", amount: "1" })] },
        { limits: [limit({ unit: "runs", amount: "1", currency: "EUR" })] },
        { overrides: [{ unit: "cost", amount: "1", currency: "USD", until: null }] },
        { overrides: [{ unit: "runs", amount: "1", currency: null, until: "tomorrow" }] },
        { endUserId: "eu_other000000000000001" },
        { version: -1 },
        { limits: undefined },
      ];
      for (const fields of wrong)
        expect(refused(acmeDocument(fields)), JSON.stringify(fields)).toBe(true);
    });

    it("reads neither the product's state nor a product-wide value from a customer document", () => {
      const withProductValues = acmeDocument({
        version: 9,
        product: "paused",
        spendingCap: { amount: "1", currency: "EUR" },
        runsAtOnce: 1,
        stepBudget: { amount: "1", currency: "EUR" },
      });
      const kept = customerLimitsOf(withProductValues, scope);
      expect(kept).toEqual({ ...customerLimitsOf(acmeDocument(), scope), version: 9 });
    });
  });
});
