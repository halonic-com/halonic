import { describe, expect, it } from "vitest";
import { JSON_SCHEMA_DRAFT, type Schema, s, toJsonSchema } from "./index.ts";

describe("schema-kit.json-schema-input-mode", () => {
  it("writes a 2020-12 document", () => {
    expect(toJsonSchema(s.string())).toEqual({ $schema: JSON_SCHEMA_DRAFT, type: "string" });
  });

  it("leaves keys with defaults or .optional() out of required", () => {
    const schema = s
      .object({
        name: s.string().min(1),
        local: s.boolean().default(false),
        note: s.string().optional(),
      })
      .strict();
    expect(toJsonSchema(schema)).toEqual({
      $schema: JSON_SCHEMA_DRAFT,
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

  it("writes a recursive schema once and refers to it", () => {
    type Tree = { children: Tree[] };
    const tree: Schema<Tree> = s.lazy(() => s.object({ children: s.array(tree) }));
    const document = toJsonSchema(s.object({ root: tree }));
    expect(Object.keys(document["$defs"] ?? {})).toHaveLength(1);
    expect(JSON.stringify(document)).toContain('"$ref":"#/$defs/');
  });

  it("leaves refinements out instead of failing", () => {
    const schema = s.string().refine((text) => text.trim() === text, "No spaces around it");
    expect(toJsonSchema(schema)).toEqual({ $schema: JSON_SCHEMA_DRAFT, type: "string" });
  });
});
