import { describe, expect, it } from "vitest";
import { parsedValue, problemsOf, summary, yaml } from "../../test/parse.ts";

const collection = (...lines: string[]) => yaml("id: invoices", "name: Invoices", ...lines);

describe("format.collection-file", () => {
  it("fills in implements, views, seed and each field's required", () => {
    expect(parsedValue("collection", collection("fields:", "  amount: { type: money }"))).toEqual({
      version: 1,
      id: "invoices",
      name: "Invoices",
      implements: [],
      fields: { amount: { type: "money", required: false } },
      views: {},
      seed: [],
    });
  });

  it("fills in a view's where and keeps its filters and seed records", () => {
    const text = collection(
      "fields:",
      "  due: { type: date }",
      "views:",
      "  open:",
      "    where: { due: { lt: today }, state: [open, null] }",
      "    total: amount",
      "seed:",
      "  - { id: inv-1, due: 2026-01-31 }",
    );
    const value = parsedValue("collection", text);
    expect(value.views["open"]).toEqual({
      where: { due: { lt: "today" }, state: ["open", null] },
      total: "amount",
    });
    expect(value.seed).toEqual([{ id: "inv-1", due: "2026-01-31" }]);
  });

  it("refuses a choice without values and a ref without a collection, at the field", () => {
    const text = collection("fields:", "  state: { type: choice }", "  supplier: { type: ref }");
    expect(summary(problemsOf("collection", text))).toEqual([
      "fields.state custom 4",
      "fields.supplier custom 5",
    ]);
  });

  it("refuses a collection without fields, a bad field name and a seed record without an id", () => {
    expect(summary(problemsOf("collection", collection("fields: {}")))).toEqual([
      "fields custom 3",
    ]);
    const text = collection("fields:", "  due-date: { type: date }", "seed:", "  - { due: x }");
    expect(summary(problemsOf("collection", text))).toEqual([
      "fields.due-date invalid_key 4",
      "seed.0.id invalid_type 6",
    ]);
  });

  it("refuses an id with an underscore, which other ids allow", () => {
    const text = yaml("id: open_invoices", "name: Open", "fields:", "  a: { type: text }");
    expect(summary(problemsOf("collection", text))).toEqual(["id invalid_format 1"]);
  });

  it("refuses an unknown comparison in a view", () => {
    const text = collection(
      "fields:",
      "  due: { type: date }",
      "views:",
      "  open:",
      "    where: { due: { before: today } }",
    );
    expect(summary(problemsOf("collection", text))).toEqual([
      "views.open.where.due unrecognized_keys 7",
    ]);
  });
});
