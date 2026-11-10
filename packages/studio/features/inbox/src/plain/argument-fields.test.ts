import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { argumentFields, rawJson } from "./argument-fields.ts";

verifies("inbox.argument-fields", () => {
  it("shows every argument as name and value, in the order sent", () => {
    expect(
      argumentFields({ title: "Refund for Sam", body: "", tag: null, pinned: false, size: 3 }),
    ).toEqual([
      { name: "title", depth: 0, value: { kind: "text", text: "Refund for Sam" } },
      { name: "body", depth: 0, value: { kind: "placeholder", text: "(empty)" } },
      { name: "tag", depth: 0, value: { kind: "placeholder", text: "(none)" } },
      { name: "pinned", depth: 0, value: { kind: "literal", text: "false" } },
      { name: "size", depth: 0, value: { kind: "literal", text: "3" } },
    ]);
  });

  it("indents nested values and names list items from 1", () => {
    expect(argumentFields({ note: { labels: ["refund", "sam"], extra: {} } })).toEqual([
      { name: "note", depth: 0, value: { kind: "group", text: "2 fields" } },
      { name: "labels", depth: 1, value: { kind: "group", text: "2 items" } },
      { name: "1", depth: 2, value: { kind: "text", text: "refund" } },
      { name: "2", depth: 2, value: { kind: "text", text: "sam" } },
      { name: "extra", depth: 1, value: { kind: "placeholder", text: "(empty)" } },
    ]);
  });

  it("shows arguments that aren't an object as one field", () => {
    expect(argumentFields("just text")).toEqual([
      { name: "arguments", depth: 0, value: { kind: "text", text: "just text" } },
    ]);
    expect(argumentFields(null)).toEqual([
      { name: "arguments", depth: 0, value: { kind: "placeholder", text: "(none)" } },
    ]);
  });

  it("shows a value past 5 levels only by its size", () => {
    const deep = { a: { b: { c: { d: { e: { f: 1 }, g: 2 } } } } };
    expect(argumentFields(deep).slice(3)).toEqual([
      { name: "d", depth: 3, value: { kind: "group", text: "2 fields" } },
      { name: "e", depth: 4, value: { kind: "cut", text: "1 field in the raw JSON" } },
      { name: "g", depth: 4, value: { kind: "literal", text: "2" } },
    ]);
  });

  it("shows 200 fields and says how many are left", () => {
    const many = Object.fromEntries(
      Array.from({ length: 250 }, (_, index) => [`f${index}`, index]),
    );
    const fields = argumentFields(many);
    expect(fields).toHaveLength(201);
    expect(fields.at(-1)).toEqual({
      name: "",
      depth: 0,
      value: { kind: "cut", text: "50 more fields in the raw JSON" },
    });
  });

  it("gives the exact arguments as raw JSON", () => {
    expect(rawJson({ title: "Refund for Sam", body: "" })).toBe(
      '{\n  "title": "Refund for Sam",\n  "body": ""\n}',
    );
    expect(rawJson(undefined)).toBe("null");
  });
});
