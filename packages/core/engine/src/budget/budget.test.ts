import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { budgetStopOf, monthlyBudgetReached, runBudgetReached } from "./budget.ts";

verifies("engine.budget-stop-message", () => {
  it("pins the run and the monthly budget's messages", () => {
    expect(runBudgetReached(5, 5.08, "EUR")).toBe("Run budget reached: 5.08 of 5.00 EUR spent.");
    expect(monthlyBudgetReached(50, 50.1, "EUR")).toBe(
      "Monthly budget reached: 50.10 of 50.00 EUR spent this month.",
    );
  });

  it("keeps up to four decimals, so a spend under a cent never reads as 0.00", () => {
    expect(runBudgetReached(0.01, 0.0123, "EUR")).toBe(
      "Run budget reached: 0.0123 of 0.01 EUR spent.",
    );
    expect(runBudgetReached(0.005, 0.005, "USD")).toBe(
      "Run budget reached: 0.005 of 0.005 USD spent.",
    );
  });
});

describe("budgetStopOf", () => {
  const budget = { currency: "EUR", perRun: 1, monthly: 10 };

  it("lets a call happen below both limits", () => {
    expect(budgetStopOf(budget, { run: 0.99, month: 9.99 })).toBeNull();
  });

  it("stops once a limit is reached, the run budget first", () => {
    expect(budgetStopOf(budget, { run: 1, month: 10 })).toBe(
      "Run budget reached: 1.00 of 1.00 EUR spent.",
    );
    expect(budgetStopOf(budget, { run: 0.5, month: 10 })).toBe(
      "Monthly budget reached: 10.00 of 10.00 EUR spent this month.",
    );
  });

  it("never stops for a limit the budget doesn't set", () => {
    expect(budgetStopOf({ currency: "EUR" }, { run: 100, month: 1000 })).toBeNull();
  });
});
