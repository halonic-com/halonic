import { type JsonSchema, JsonSchemaContext } from "./json-schema-context.ts";
import type { AnySchema } from "./schema.ts";

/** The JSON Schema version `toJsonSchema` writes. */
export const JSON_SCHEMA_DRAFT = "https://json-schema.org/draft/2020-12/schema";

/**
 * Describes a schema as a JSON Schema document, for editors, docs and other
 * engines. It describes the **input**: a key with a default may be left out,
 * so it isn't `required`. Refinements can't be expressed and are left out.
 * Recursive schemas become `$defs` entries named `__schema0`, `__schema1`, …
 *
 * @example
 * toJsonSchema(s.object({ name: s.string().min(1) }).strict());
 * // { $schema: "…/2020-12/schema", type: "object", properties: { name: { type: "string", minLength: 1 } },
 * //   required: ["name"], additionalProperties: false }
 */
export function toJsonSchema(schema: AnySchema): JsonSchema {
  const context = new JsonSchemaContext();
  const root = schema.toJsonSchemaNode(context);
  const document: JsonSchema = { $schema: JSON_SCHEMA_DRAFT, ...root };
  const definitions = context.definitions;
  if (Object.keys(definitions).length > 0) document["$defs"] = { ...definitions };
  return document;
}
