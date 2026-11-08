import { type JsonSchema, toJsonSchema } from "@halonicjs/schema-kit";
import { fileKinds, type KindName } from "./registry.ts";

/**
 * The JSON Schema (2020-12) of a file kind, for editors, docs and other
 * engines. It describes what a file may contain: keys with a default are
 * not required. Checks over several fields can't be expressed and are left out.
 *
 * @example
 * const schema = jsonSchemaOf("agent");
 * schema["required"]; // ["id", "name"]
 */
export function jsonSchemaOf(kind: KindName): JsonSchema {
  return toJsonSchema(fileKinds[kind].schema);
}
