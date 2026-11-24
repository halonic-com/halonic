/**
 * Loads the OpenUI Lang 1.1 conformance fixtures copied into `fixtures/spec-1.1`
 * and turns their test library (a JSON Schema LibrarySpec) into our library shape.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import type { OpenUiLibrary, OpenUiProp, OpenUiPropType } from "../library.ts";

const ROOT = new URL("../../fixtures/spec-1.1/", import.meta.url);

/** One case folder: `area/NNN-name`, and the files it holds. */
export interface SpecCase {
  readonly id: string;
  /** The program text; for a streaming case, its chunks joined. */
  readonly text: string;
  readonly chunks?: readonly string[];
  readonly patch?: string;
  readonly expected?: Expected;
}

/** The parts of `expected.json` a program case compares. */
export interface Expected {
  readonly root: unknown;
  readonly errors: readonly { readonly code: string; readonly statementId?: string }[];
  readonly unresolved: readonly string[];
  readonly orphans: readonly string[];
  readonly incomplete: boolean;
  readonly state?: Readonly<Record<string, unknown>>;
  readonly statements?: readonly string[];
  readonly errorObjects?: readonly Readonly<Record<string, string>>[];
}

export function specCases(): SpecCase[] {
  const areas = readdirSync(ROOT, { withFileTypes: true }).filter((entry) => entry.isDirectory());
  return areas.flatMap((area) =>
    readdirSync(new URL(`${area.name}/`, ROOT), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => readCase(`${area.name}/${entry.name}`))
      .sort((left, right) => left.id.localeCompare(right.id)),
  );
}

function readCase(id: string): SpecCase {
  const file = (name: string) => {
    const url = new URL(`${id}/${name}`, ROOT);
    return existsSync(url) ? readFileSync(url, "utf8") : undefined;
  };
  const chunksText = file("chunks.json");
  const chunks = chunksText === undefined ? undefined : (JSON.parse(chunksText) as string[]);
  const expectedText = file("expected.json");
  const patch = file("patch.oui");
  return {
    id,
    text: chunks?.join("") ?? file("input.oui") ?? "",
    ...(chunks ? { chunks } : {}),
    ...(patch === undefined ? {} : { patch }),
    ...(expectedText === undefined ? {} : { expected: JSON.parse(expectedText) as Expected }),
  };
}

interface SchemaProp {
  readonly type?: string;
  readonly enum?: readonly string[];
  readonly items?: { readonly anyOf?: unknown; readonly $ref?: string };
  readonly $ref?: string;
  readonly anyOf?: unknown;
}

interface SchemaComponent {
  readonly properties: Readonly<Record<string, SchemaProp>>;
  readonly required?: readonly string[];
}

/** The fixtures' test library, in our shape. */
export function specLibrary(): OpenUiLibrary {
  const spec = JSON.parse(readFileSync(new URL("library.json", ROOT), "utf8")) as {
    readonly root: string;
    readonly schema: {
      readonly properties: Readonly<Record<string, unknown>>;
      readonly $defs: Readonly<Record<string, SchemaComponent>>;
    };
  };
  const components: Record<string, readonly OpenUiProp[]> = {};
  for (const name of Object.keys(spec.schema.properties)) {
    const definition = spec.schema.$defs[name];
    if (definition === undefined) continue;
    components[name] = Object.entries(definition.properties).map(([prop, schema]) => ({
      name: prop,
      type: propType(schema),
      required: definition.required?.includes(prop) ?? false,
    }));
  }
  return { root: spec.root, components };
}

function propType(schema: SchemaProp): OpenUiPropType {
  // A `$ref` or an `anyOf` of `$ref`s outside a list is an action slot in the test library.
  if (schema.$ref !== undefined || schema.anyOf !== undefined) return { kind: "action" };
  if (schema.type === "array")
    return schema.items === undefined ? { kind: "list" } : { kind: "components" };
  if (schema.type === "string")
    return schema.enum ? { kind: "string", oneOf: schema.enum } : { kind: "string" };
  if (schema.type === "number" || schema.type === "boolean" || schema.type === "object")
    return { kind: schema.type };
  return { kind: "any" };
}
