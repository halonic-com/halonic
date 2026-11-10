import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import { breakingChanges } from "./spec-breaking.ts";

const released = {
  type: "object",
  required: ["id"],
  properties: {
    id: { type: "string" },
    version: { const: 1 },
    kind: { enum: ["a", "b"] },
    steps: { type: "array", items: { type: "object", properties: { run: { type: "string" } } } },
  },
};

verifies("check.api-specs-breaking", () => {
  test("accepts a new optional property, a new enum value and no change", () => {
    expect(breakingChanges(released, released)).toEqual([]);
    const additive = {
      ...released,
      properties: {
        ...released.properties,
        note: { type: "string" },
        kind: { enum: ["a", "b", "c"] },
      },
    };
    expect(breakingChanges(released, additive)).toEqual([]);
  });

  test("names a removed property", () => {
    const { id: _id, ...properties } = released.properties;
    expect(breakingChanges(released, { ...released, properties })).toEqual([
      '$: the property "id" was removed.',
    ]);
  });

  test("names a newly required key", () => {
    expect(breakingChanges(released, { ...released, required: ["id", "note"] })).toEqual([
      '$: "note" is newly required.',
    ]);
  });

  test("names a removed enum value, a changed type and a changed const", () => {
    const current = {
      ...released,
      properties: {
        ...released.properties,
        id: { type: "number" },
        version: { const: 2 },
        kind: { enum: ["a"] },
      },
    };
    expect(breakingChanges(released, current)).toEqual([
      '$.properties.id: "type" changed from "string" to "number".',
      '$.properties.version: "const" changed from 1 to 2.',
      '$.properties.kind: the enum value "b" was removed.',
    ]);
  });

  test("looks inside array items", () => {
    const current = {
      ...released,
      properties: {
        ...released.properties,
        steps: { type: "array", items: { type: "object", properties: {} } },
      },
    };
    expect(breakingChanges(released, current)).toEqual([
      '$.properties.steps.items: the property "run" was removed.',
    ]);
  });

  test("looks inside definitions and alternatives", () => {
    const before = { $defs: { id: { type: "string" } }, anyOf: [{ type: "string" }, { const: 1 }] };
    const after = { $defs: { id: { type: "number" } }, anyOf: [{ type: "string" }, { const: 2 }] };
    expect(breakingChanges(before, after)).toEqual([
      '$.$defs.id: "type" changed from "string" to "number".',
      '$.anyOf[1]: "const" changed from 1 to 2.',
    ]);
    expect(breakingChanges(before, { ...after, anyOf: [{ type: "string" }] })).toContain(
      '$: the number of "anyOf" alternatives changed from 2 to 1.',
    );
  });
});
