import { JSON_SCHEMA_DRAFT, type JsonSchema, toJsonSchema } from "@halonicjs/schema-kit";
import { fileKinds, type KindName } from "./registry.ts";
import { SCHEMA_VERSION } from "./shared/fields.ts";

/** Where the `$id` of every file kind's JSON Schema starts. Nothing is hosted there yet. */
export const SPEC_ID_BASE = "https://halonic.com/spec/format";

/**
 * A kind's name in its spec file and `$id`: the kind name in kebab case,
 * so `workflowTest` becomes `workflow-test`.
 */
export function specName(kind: KindName): string {
  return kind.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

/**
 * The `$id` of a kind's JSON Schema. It names the schema and the file format
 * version it describes, for example
 * `https://halonic.com/spec/format/workflow/v1.schema.json`.
 */
export function specId(kind: KindName): string {
  return idOf(kind, toJsonSchema(fileKinds[kind].schema));
}

function idOf(kind: KindName, schema: JsonSchema): string {
  return `${SPEC_ID_BASE}/${specName(kind)}/v${kindVersion(schema)}.schema.json`;
}

/**
 * The file format version a kind's schema describes: the `const` of its
 * `version` key. A kind without a `version` key (`skill`, whose file is
 * SKILL.md front matter) falls back to the format's SCHEMA_VERSION.
 */
function kindVersion(schema: JsonSchema): unknown {
  const properties = schema["properties"] as Record<string, { const?: unknown }> | undefined;
  return properties?.["version"]?.const ?? SCHEMA_VERSION;
}

/**
 * The JSON Schema (2020-12) of a file kind, for editors, docs and other
 * engines. It describes what a file may contain: keys with a default are
 * not required. Checks over several fields can't be expressed and are left out.
 *
 * @example
 * const schema = jsonSchemaOf("agent");
 * schema["required"]; // ["id", "name"]
 * schema["$id"]; // "https://halonic.com/spec/format/agent/v1.schema.json"
 */
export function jsonSchemaOf(kind: KindName): JsonSchema {
  // `$schema` and `$id` come first, where readers of the spec file look for
  // them; the spread keeps a key where it was first set.
  const schema = toJsonSchema(fileKinds[kind].schema);
  return { $schema: JSON_SCHEMA_DRAFT, $id: idOf(kind, schema), ...schema };
}
