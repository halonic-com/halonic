import { describe, expect, it } from "vitest";
import { type AnySchema, JSON_SCHEMA_DRAFT, type JsonSchema, s, toJsonSchema } from "./index.ts";
import { Guard } from "./test/old-schemas.kit.ts";

// The node without the "$schema" line every document starts with.
function nodeOf(schema: AnySchema): JsonSchema {
  const { $schema, ...node } = toJsonSchema(schema);
  expect($schema).toBe(JSON_SCHEMA_DRAFT);
  return node;
}

describe("schema-kit.json-schema-input-mode", () => {
  it("describes primitives with their checks", () => {
    expect(nodeOf(s.string().min(1).max(5).regex(/^a/))).toEqual({
      type: "string",
      minLength: 1,
      maxLength: 5,
      pattern: "^a",
    });
    expect(nodeOf(s.string().regex(/^a/).regex(/b$/))).toEqual({
      type: "string",
      pattern: "^a",
      allOf: [{ pattern: "b$" }],
    });
    expect(nodeOf(s.string().url())).toEqual({ type: "string", format: "uri" });
    expect(nodeOf(s.string().email())).toMatchObject({ type: "string", format: "email" });
    expect(nodeOf(s.number().min(0).max(2))).toEqual({ type: "number", minimum: 0, maximum: 2 });
    expect(nodeOf(s.number().int().positive())).toEqual({
      type: "integer",
      exclusiveMinimum: 0,
      maximum: Number.MAX_SAFE_INTEGER,
    });
    expect(nodeOf(s.number().int().min(1).max(64))).toEqual({
      type: "integer",
      minimum: 1,
      maximum: 64,
    });
    expect(nodeOf(s.boolean())).toEqual({ type: "boolean" });
    expect(nodeOf(s.null())).toEqual({ type: "null" });
    expect(nodeOf(s.unknown())).toEqual({});
  });

  it("describes literals and enums", () => {
    expect(nodeOf(s.literal(1))).toEqual({ type: "number", const: 1 });
    expect(nodeOf(s.literal("text"))).toEqual({ type: "string", const: "text" });
    expect(nodeOf(s.literal(true))).toEqual({ type: "boolean", const: true });
    expect(nodeOf(s.literal(null))).toEqual({ type: "null", const: null });
    expect(nodeOf(s.enum(["a", "b"]))).toEqual({ type: "string", enum: ["a", "b"] });
  });

  it("leaves keys with defaults or .optional() out of required", () => {
    const schema = s
      .object({
        name: s.string().min(1),
        local: s.boolean().default(false),
        note: s.string().optional(),
      })
      .strict();
    expect(nodeOf(schema)).toEqual({
      type: "object",
      properties: {
        name: { type: "string", minLength: 1 },
        local: { type: "boolean", default: false },
        note: { type: "string" },
      },
      required: ["name"],
      additionalProperties: false,
    });
  });

  it("describes the unknown-key modes", () => {
    expect(nodeOf(s.object({}))).toEqual({ type: "object", properties: {} });
    expect(nodeOf(s.object({}).passthrough())).toEqual({
      type: "object",
      properties: {},
      additionalProperties: {},
    });
  });

  it("writes defaults as JSON", () => {
    expect(nodeOf(s.object({ a: s.number().optional() }).default({ a: undefined }))).toMatchObject({
      default: {},
    });
    expect(nodeOf(s.number().default(Number.NaN))).toMatchObject({ default: null });
    expect(nodeOf(s.array(s.string()).default(["x"]))).toMatchObject({ default: ["x"] });
  });

  it("describes lists, tuples and records", () => {
    expect(nodeOf(s.array(s.string()).min(1).max(3))).toEqual({
      type: "array",
      items: { type: "string" },
      minItems: 1,
      maxItems: 3,
    });
    expect(nodeOf(s.tuple([s.string(), s.number().optional()]))).toEqual({
      type: "array",
      prefixItems: [{ type: "string" }, { type: "number" }],
      items: false,
      minItems: 1,
      maxItems: 2,
    });
    expect(nodeOf(s.record(s.string().min(1), s.number()))).toEqual({
      type: "object",
      propertyNames: { type: "string", minLength: 1 },
      additionalProperties: { type: "number" },
    });
  });

  it("describes unions, discriminated unions and intersections", () => {
    expect(nodeOf(s.union([s.string(), s.number(), s.null()]))).toEqual({
      type: ["string", "number", "null"],
    });
    expect(nodeOf(s.union([s.literal("text"), s.number()]))).toEqual({
      anyOf: [{ type: "string", const: "text" }, { type: "number" }],
    });
    expect(
      nodeOf(
        s.discriminatedUnion("type", [
          s.object({ type: s.literal("a") }),
          s.object({ type: s.literal("b") }),
        ]),
      ),
    ).toEqual({
      oneOf: [
        {
          type: "object",
          properties: { type: { type: "string", const: "a" } },
          required: ["type"],
        },
        {
          type: "object",
          properties: { type: { type: "string", const: "b" } },
          required: ["type"],
        },
      ],
    });
    expect(nodeOf(s.intersection(s.object({}), s.object({})))).toEqual({
      allOf: [
        { type: "object", properties: {} },
        { type: "object", properties: {} },
      ],
    });
  });

  it("leaves refinements out", () => {
    expect(nodeOf(s.string().refine(() => true, "x"))).toEqual({ type: "string" });
  });

  it("writes a recursive schema once, under $defs", () => {
    const document = toJsonSchema(s.object({ when: Guard.optional() }));
    expect(document["properties"]).toEqual({ when: { $ref: "#/$defs/__schema0" } });
    expect(Object.keys(document["$defs"] ?? {})).toEqual(["__schema0"]);
    expect(JSON.stringify(document["$defs"])).toContain('"$ref":"#/$defs/__schema0"');
  });
});
