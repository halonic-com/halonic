import type { RecordChange } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { evaluateFormula } from "./computed.ts";
import {
  type CollectionRecord,
  currentRecords,
  filterRecords,
  viewRecords,
} from "./record-query.ts";
import { invoices } from "./records-test-kit.test-helper.ts";

const today = "2026-11-10";

function record(id: string, values: Record<string, unknown>): CollectionRecord {
  return { id, values, updatedAt: "2026-11-01T09:00:00.000Z" };
}

function add(id: string, values: Record<string, unknown>, at: string): RecordChange {
  return { at, collection: "invoices", id, op: "add", values };
}

verifies("engine.record-computed", () => {
  describe("computed fields", () => {
    it("works out a computed money field from the stored values, rounded to cents", () => {
      const changes: RecordChange[] = [
        add("inv-1", { amount: 99.99, sharePct: 33 }, "2026-11-01T09:00:00.000Z"),
        { ...add("inv-1", { sharePct: 50 }, "2026-11-02T09:00:00.000Z"), op: "update" },
        add("inv-2", { amount: 10 }, "2026-11-03T09:00:00.000Z"),
      ];

      expect(currentRecords(invoices, changes)).toEqual([
        {
          id: "inv-1",
          values: { amount: 99.99, sharePct: 50, share: 50 },
          updatedAt: "2026-11-02T09:00:00.000Z",
        },
        { id: "inv-2", values: { amount: 10, share: null }, updatedAt: "2026-11-03T09:00:00.000Z" },
      ]);
    });

    it.each([
      ["2 + 3 * 4", 14],
      ["(2 + 3) * 4", 20],
      ["10 - 4 - 3", 3],
      ["-amount + 1.5", -0.5],
      ["amount / 4", 0.5],
      ["amount / zero", null],
      ["amount * missing", null],
      ["amount * label", null],
    ])("reads %s as %s", (formula, expected) => {
      expect(evaluateFormula(formula, { amount: 2, zero: 0, label: "x" })).toBe(expected);
    });

    it.each([
      "amount ^ 2",
      "amount * 19%",
      "amount % 2",
      "amount.5",
      "amount zero",
      "amount * (zero + 1",
      "amount)",
      "amount +",
      "* amount",
      "()",
      "",
    ])("gives null for the badly written formula %j", (formula) => {
      expect(evaluateFormula(formula, { amount: 2, zero: 0 })).toBeNull();
    });
  });
});

verifies("engine.record-filter", () => {
  describe("filterRecords", () => {
    const records = [
      record("inv-1", { amount: 50, due: "2026-11-01", status: "open" }),
      record("inv-2", { amount: 200, due: "2026-12-01", status: "paid" }),
      record("inv-3", { amount: 120, status: "open" }),
    ];
    const ids = (where: Record<string, unknown>) =>
      filterRecords(records, where, { today }).map((found) => found.id);

    it.each([
      [{ status: "open" }, ["inv-1", "inv-3"]],
      [{ status: ["paid", "lost"] }, ["inv-2"]],
      [{ due: null }, ["inv-3"]],
      [{ due: { lt: "today" } }, ["inv-1"]],
      [{ due: { gte: "today" } }, ["inv-2"]],
      [{ amount: { gt: 50, lte: 200 } }, ["inv-2", "inv-3"]],
      [{ amount: { not: [50, 120] } }, ["inv-2"]],
      [{ due: { not: null } }, ["inv-1", "inv-2"]],
      [{ due: { not: "2026-11-01" } }, ["inv-2", "inv-3"]],
      [{ id: "inv-3", status: "open" }, ["inv-3"]],
      [{}, ["inv-1", "inv-2", "inv-3"]],
    ])("keeps the records that match %j", (where, expected) => {
      expect(ids(where)).toEqual(expected);
    });

    it("sorts by a field, numbers in order and empty values first", () => {
      const sorted = filterRecords(records, {}, { today, sort: "due" });

      expect(sorted.map((found) => found.id)).toEqual(["inv-3", "inv-1", "inv-2"]);
    });

    it("sorts decimal and negative amounts as numbers", () => {
      const amounts = [12.5, 12.25, -5, -10, 0.1, 0.05, null, 100];
      const unsorted = amounts.map((amount, index) => record(`inv-${index}`, { amount }));

      const sorted = filterRecords(unsorted, {}, { today, sort: "amount" });

      expect(sorted.map((found) => found.values["amount"])).toEqual([
        null,
        -10,
        -5,
        0.05,
        0.1,
        12.25,
        12.5,
        100,
      ]);
    });
  });

  describe("viewRecords", () => {
    const records = [
      record("inv-1", { amount: 10.005, due: "2026-12-01", status: "open" }),
      record("inv-2", { amount: 0.1, due: "2026-11-01", status: "open" }),
      record("inv-3", { amount: 999, status: "paid" }),
      record("inv-4", { amount: "n/a", due: "2026-11-15", status: "open" }),
    ];

    it("applies the view's where and sort, and sums its total to cents", () => {
      const viewed = viewRecords(invoices, records, "open", today);

      expect(viewed.records.map((found) => found.id)).toEqual(["inv-2", "inv-4", "inv-1"]);
      expect(viewed.total).toBe(10.11);
    });

    it("gives no total for a view without one, and every record for an unknown view", () => {
      expect(viewRecords(invoices, records, "all", today)).toEqual({ records });
      expect(viewRecords(invoices, records, "missing", today)).toEqual({ records });
    });
  });
});
