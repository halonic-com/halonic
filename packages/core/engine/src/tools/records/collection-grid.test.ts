import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { collectionGrid, editCell, newRow } from "./collection-grid.ts";
import type { CollectionRecord } from "./record-query.ts";
import { invoices } from "./records-test-kit.test-helper.ts";

function record(id: string, values: CollectionRecord["values"]): CollectionRecord {
  return { id, values, updatedAt: "2026-11-15T10:00:00.000Z" };
}

const records = [
  record("a", { amount: 60, status: "open" }),
  record("b", { amount: 20.5, status: "paid" }),
  record("c", { amount: 10.25, status: "open" }),
];

verifies("engine.collection-grid", () => {
  describe("collectionGrid", () => {
    it("lists the columns in file order with their flags", () => {
      const { fields } = collectionGrid(invoices, records, "2026-11-15");
      expect(fields.map((field) => field.name)).toEqual(Object.keys(invoices.fields));
      expect(fields.find((field) => field.name === "share")).toMatchObject({ computed: true });
      expect(fields.find((field) => field.name === "amount")).toMatchObject({
        required: true,
        computed: false,
      });
      expect(fields.find((field) => field.name === "status")?.choices).toEqual(["open", "paid"]);
    });

    it("gives All and each view a count, and a total where the view has one", () => {
      expect(collectionGrid(invoices, records, "2026-11-15").views).toEqual([
        { view: null, count: 3 },
        { view: "open", count: 2, total: 70.25 },
        { view: "all", count: 3 },
      ]);
    });

    it("shows every record for All and only the view's records for a view", () => {
      expect(collectionGrid(invoices, records, "2026-11-15").rows).toHaveLength(3);
      const open = collectionGrid(invoices, records, "2026-11-15", "open");
      expect(open.rows.map((row) => row.id)).toEqual(["a", "c"]);
    });

    it("shows every record for a view the collection doesn't have", () => {
      expect(collectionGrid(invoices, records, "2026-11-15", "gone").rows).toHaveLength(3);
    });
  });

  describe("editCell", () => {
    it("brings typed text into the field's form", () => {
      expect(editCell(invoices, "amount", " 65 ")).toEqual({ ok: true, values: { amount: 65 } });
    });

    it("empties an optional field with null", () => {
      expect(editCell(invoices, "note", "")).toEqual({ ok: true, values: { note: null } });
    });

    it("refuses emptying a required field", () => {
      expect(editCell(invoices, "amount", "")).toEqual({
        ok: false,
        message: '"amount" is required',
      });
    });

    it("gives the core message for a value the field doesn't accept", () => {
      expect(editCell(invoices, "amount", "lots")).toEqual({
        ok: false,
        message: '"amount" must be a number (got "lots")',
      });
    });

    it("changes no computed or unknown field", () => {
      expect(editCell(invoices, "share", "5").ok).toBe(false);
      expect(editCell(invoices, "constructor", "5").ok).toBe(false);
    });
  });

  describe("newRow", () => {
    it("lists the required fields still empty and prefills defaults", () => {
      const row = newRow(invoices, { note: "School trip" });
      expect(row.stillNeeded).toEqual(["supplier", "amount"]);
      expect(row.draft).toEqual({ note: "School trip", sharePct: "100" });
      expect(row.record).toBeUndefined();
    });

    it("gives the record when every required field is filled", () => {
      const row = newRow(invoices, { supplier: "sup-1", amount: "20" });
      expect(row.stillNeeded).toEqual([]);
      expect(row.record).toEqual({ supplier: "sup-1", amount: 20, sharePct: 100 });
    });

    it("gives the first message instead of a record for a value not accepted", () => {
      const row = newRow(invoices, { supplier: "sup-1", amount: "lots" });
      expect(row.record).toBeUndefined();
      expect(row.message).toBe('"amount" must be a number (got "lots")');
    });
  });
});
