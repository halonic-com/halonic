import { z } from "zod";
import type { Schema } from "./schema.ts";

/** A JSON value: what a JSON Schema document is made of. */
export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

/** A JSON Schema document. */
export type JsonSchema = { [key: string]: JsonValue };

/** The JSON Schema version `toJsonSchema` writes. */
export const JSON_SCHEMA_DRAFT = "https://json-schema.org/draft/2020-12/schema";

/**
 * Describes a schema as a JSON Schema 2020-12 document, for editors, docs and
 * other engines. It describes the **input**: a key with a default may be left
 * out, so it isn't `required`. Refinements can't be expressed and are left
 * out. Recursive schemas become `$defs` entries referenced with `$ref`.
 *
 * @example
 * toJsonSchema(s.object({ name: s.string().min(1) }).strict());
 * // { $schema: "…/2020-12/schema", type: "object", properties: { name: { type: "string", minLength: 1 } },
 * //   required: ["name"], additionalProperties: false }
 */
export function toJsonSchema(schema: Schema): JsonSchema {
  const document = z.toJSONSchema(schema, {
    target: "draft-2020-12",
    io: "input",
    unrepresentable: "any",
  });
  return document as JsonSchema;
}
