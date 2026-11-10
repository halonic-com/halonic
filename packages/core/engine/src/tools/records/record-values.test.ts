import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { checkRecord } from "./record-values.ts";
import { invoices } from "./records-test-kit.test-helper.ts";

verifies("engine.record-values", () => {
  describe("checkRecord", () => {
    it("refuses an inherited key such as constructor as an unknown field", () => {
      const checked = checkRecord(invoices, {
        supplier: "sup-1",
        amount: 1,
        due: "2026-11-30",
        period: "2026-11",
        status: "open",
        constructor: 5,
      });

      expect(checked.errors).toEqual([
        'Unknown field "constructor" (fields: supplier, note, amount, sharePct, share, due, period, status, disputed)',
      ]);
    });

    it("brings values into their fields' form and fills in defaults", () => {
      const checked = checkRecord(invoices, {
        id: "inv-1",
        supplier: "sup-1",
        note: { line: 2 },
        amount: "€ 12,5",
        due: "2026-11-30",
        period: "2026-11",
        status: "open",
        disputed: "false",
      });

      expect(checked.errors).toEqual([]);
      expect(checked.values).toEqual({
        supplier: "sup-1",
        note: '{"line":2}',
        amount: 12.5,
        sharePct: 100,
        due: "2026-11-30",
        period: "2026-11",
        status: "open",
        disputed: false,
      });
    });

    it("rounds money to cents and keeps empty values as null", () => {
      const checked = checkRecord(invoices, { supplier: "s", amount: 10.004, note: "", due: null });

      expect(checked.values).toMatchObject({ amount: 10, note: null, due: null });
    });

    it("lists every problem with a record", () => {
      const checked = checkRecord(invoices, {
        colour: "red",
        share: 4,
        amount: -1,
        sharePct: 101,
        due: "30/11/2026",
        period: "2026-11-01",
        status: "lost",
        disputed: "maybe",
      });

      expect(checked.errors).toEqual([
        'Unknown field "colour" (fields: supplier, note, amount, sharePct, share, due, period, status, disputed)',
        '"share" is computed and cannot be set',
        '"supplier" is required',
        '"amount" must be at least 0 (got -1)',
        '"sharePct" must be at most 100 (got 101)',
        '"due" must be a date YYYY-MM-DD (got "30/11/2026")',
        '"period" must be a month YYYY-MM (got "2026-11-01")',
        '"status" must be one of open, paid (got "lost")',
        '"disputed" must be true or false (got "maybe")',
      ]);
    });

    it("refuses a value that isn't a number in a number field", () => {
      expect(checkRecord(invoices, { supplier: "s", amount: "lots" }).errors).toEqual([
        '"amount" must be a number (got "lots")',
      ]);
      expect(checkRecord(invoices, { supplier: "s", amount: true }).errors).toEqual([
        '"amount" must be a number (got true)',
      ]);
    });

    it.each(["€", " ", "$ ", "1,234", "1,234,567"])(
      "refuses %j in a number field, with nothing left or an unclear comma",
      (amount) => {
        expect(checkRecord(invoices, { supplier: "s", amount }).errors).toEqual([
          `"amount" must be a number (got ${JSON.stringify(amount)})`,
        ]);
      },
    );

    it("refuses a date or month that isn't on the calendar", () => {
      const checked = checkRecord(invoices, {
        supplier: "s",
        amount: 1,
        due: "2026-02-29",
        period: "2026-13",
      });

      expect(checked.errors).toEqual([
        '"due" must be a date YYYY-MM-DD (got "2026-02-29")',
        '"period" must be a month YYYY-MM (got "2026-13")',
      ]);
      expect(checkRecord(invoices, { supplier: "s", amount: 1, due: "2028-02-29" }).errors).toEqual(
        [],
      );
    });

    it("refuses an empty required field on a new record", () => {
      expect(checkRecord(invoices, { supplier: "", amount: 1 }).errors).toEqual([
        '"supplier" is required',
      ]);
    });

    it("changes only the named fields of an update, without defaults or required fields", () => {
      const checked = checkRecord(invoices, { status: "paid", disputed: true }, { partial: true });

      expect(checked).toEqual({ values: { status: "paid", disputed: true }, errors: [] });
    });

    it.each([null, ""])("refuses an update that empties a required field with %j", (supplier) => {
      expect(checkRecord(invoices, { supplier }, { partial: true }).errors).toEqual([
        '"supplier" is required',
      ]);
    });

    it("empties a field in an update that names it with null", () => {
      expect(checkRecord(invoices, { note: null }, { partial: true }).values).toEqual({
        note: null,
      });
    });
  });
});
