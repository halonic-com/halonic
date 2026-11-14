import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { summaryWith } from "../summary.test-helper.ts";
import { spendTile } from "./spend-tile.ts";

const at = "2026-11-13T10:00:00.000Z";

function run(id: string, startedAt: string, cost: number) {
  return summaryWith({ id, startedAt, cost });
}

verifies("runs.spend-tile", () => {
  it("adds each run's cost to the UTC month it started in, oldest month first", () => {
    const tile = spendTile(
      [
        run("a", "2026-06-30T23:59:00.000Z", 1),
        run("b", "2026-07-01T00:00:00.000Z", 2),
        run("c", "2026-07-15T00:00:00.000Z", 0.5),
        run("d", "2026-11-02T00:00:00.000Z", 3),
        run("e", "2026-05-31T23:59:00.000Z", 9),
      ],
      at,
      "EUR",
      undefined,
    );

    expect(tile?.months.map((month) => [month.label, month.value])).toEqual([
      ["Jun", 1],
      ["Jul", 2.5],
      ["Aug", 0],
      ["Sep", 0],
      ["Oct", 0],
      ["Nov", 3],
    ]);
    expect(tile?.format?.(3)).toBe("€3.00");
  });

  it("never reads a tiny amount as 0.00", () => {
    const tile = spendTile([run("a", "2026-11-02T00:00:00.000Z", 0.004)], at, "EUR", undefined);
    expect(tile?.format?.(0.004)).toBe("under €0.01");
    expect(tile?.format?.(0.0004)).toBe("under €0.01");
    expect(tile?.format?.(0.006)).toBe("€0.006");
    expect(tile?.months.at(-1)).toMatchObject({ value: 0.004, hidden: true });
    expect(tile?.months.slice(0, -1).every((month) => month.hidden === undefined)).toBe(true);
    expect(tile?.format?.(tile.months.at(-1)?.value ?? 0)).toBe("under €0.01");
  });

  it("without a monthly budget has no line, no amber and says only This month", () => {
    const tile = spendTile([run("a", "2026-11-02T00:00:00.000Z", 120.4)], at, "EUR", undefined);

    expect(tile?.limit).toBeUndefined();
    expect(tile?.months.every((month) => month.budget === undefined)).toBe(true);
    expect(tile?.note).toEqual({ text: "This month, estimated" });
  });

  it("within the budget names it under the number, without amber", () => {
    const tile = spendTile([run("a", "2026-11-02T00:00:00.000Z", 40)], at, "EUR", 100);

    expect(tile?.note).toEqual({ text: "This month, estimated, within the €100.00 budget" });
    expect(tile?.limit).toEqual({ value: 100, label: "Budget" });
  });

  it("over the budget says so in amber and gives every month the one limit", () => {
    const tile = spendTile([run("a", "2026-11-02T00:00:00.000Z", 120.4)], at, "EUR", 100);

    expect(tile?.note).toEqual({
      text: "This month, estimated, over the €100.00 budget",
      attention: true,
    });
    expect(tile?.months.every((month) => month.budget === 100)).toBe(true);
  });

  it("is empty when no run cost anything in the six months, even with a budget", () => {
    expect(spendTile([], at, "EUR", 100)).toBeUndefined();
    expect(spendTile([run("a", "2026-11-02T00:00:00.000Z", 0)], at, "EUR", 100)).toBeUndefined();
    expect(spendTile([run("a", "2025-01-02T00:00:00.000Z", 5)], at, "EUR", 100)).toBeUndefined();
  });
});
