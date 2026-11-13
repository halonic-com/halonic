import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { lastMonths, spendByMonth } from "./month-spend.ts";

verifies("app.month-spend", () => {
  it("sums each run's cost into the UTC month it started in, oldest month first", () => {
    const spend = spendByMonth(
      [
        { startedAt: "2025-08-03T08:00:00.000Z", cost: 1 },
        { startedAt: "2025-08-20T08:00:00.000Z", cost: 0.5 },
        { startedAt: "2025-12-31T23:59:59.000Z", cost: 2 },
        { startedAt: "2026-01-01T00:00:00.000Z", cost: 0.25 },
        { startedAt: "2025-07-31T23:59:59.000Z", cost: 9 },
      ],
      "2026-01-20T10:00:00.000Z",
      6,
    );

    expect(spend).toEqual([
      { month: "2025-08", spent: 1.5 },
      { month: "2025-09", spent: 0 },
      { month: "2025-10", spent: 0 },
      { month: "2025-11", spent: 0 },
      { month: "2025-12", spent: 2 },
      { month: "2026-01", spent: 0.25 },
    ]);
  });

  it("counts back across a year, and answers nothing for no months", () => {
    expect(lastMonths("2026-02-10T00:00:00.000Z", 3)).toEqual(["2025-12", "2026-01", "2026-02"]);
    expect(spendByMonth([], "2026-02-10T00:00:00.000Z", 0)).toEqual([]);
  });
});
