import { integrationVersion } from "@halonicjs/ports";
import { JSON_SCHEMA_DRAFT, type JsonSchema, s, toJsonSchema } from "@halonicjs/schema-kit";
import { namePattern } from "./policy.ts";

/** Where the `$id` of each integration interface spec starts. Nothing is hosted there yet. */
export const SPEC_ID_BASE = "https://halonic.com/spec/integration-kit";

const name = s.string().regex(namePattern);
const version = s.string().regex(/^\d+\.\d+\.\d+$/);

/** The data an integration hands the host to describe a tool: the shape of `IntegrationTool`. */
export const tool = s
  .object({
    name: s.string().min(1),
    description: s.string(),
    parameters: s.record(s.string(), s.unknown()),
    risk: s.enum(["read", "write", "send"]),
    untrusted: s.boolean().optional(),
  })
  .strict();

/** What an integration package exports as data: the `Integration` without its `connect` function. */
export const integration = s.object({ name, version, tools: s.array(tool) }).strict();

/** Where the host puts a secret in a request: the shape of `SecretPlacement`. */
export const secretPlacement = s.discriminatedUnion("as", [
  s.object({ secret: s.string().min(1), as: s.literal("bearer") }).strict(),
  s
    .object({
      secret: s.string().min(1),
      as: s.literal("header"),
      header: s.string().min(1),
      prefix: s.string().optional(),
    })
    .strict(),
  s.object({ secret: s.string().min(1), as: s.literal("form"), field: s.string().min(1) }).strict(),
]);

/** The data shapes of the interface by spec name; each is committed as `spec/<name>.schema.json`. */
const documents = { integration, "secret-placement": secretPlacement };

/** The names of the integration interface's spec files. */
export type SpecName = keyof typeof documents;

export const specNames = Object.keys(documents) as SpecName[];

/**
 * The `$id` of a spec: its name and the integration interface version
 * (`integrationVersion`), for example
 * `https://halonic.com/spec/integration-kit/integration/v1.schema.json`.
 */
export function specId(spec: SpecName): string {
  return `${SPEC_ID_BASE}/${spec}/v${integrationVersion}.schema.json`;
}

/**
 * The JSON Schema (2020-12) of one data shape of the integration interface:
 * what an integration may hand the host. The files describe the shapes for
 * people and tools outside this repo; the host does not validate against them.
 *
 * @example
 * jsonSchemaOf("secret-placement")["$id"];
 * // "https://halonic.com/spec/integration-kit/secret-placement/v1.schema.json"
 */
export function jsonSchemaOf(spec: SpecName): JsonSchema {
  return { $schema: JSON_SCHEMA_DRAFT, $id: specId(spec), ...toJsonSchema(documents[spec]) };
}
