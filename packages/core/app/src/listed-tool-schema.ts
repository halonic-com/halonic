// Rebuilds a listed tool's `parameters` from the allow-list in
// `ports.untrusted-tool-listings`. Nothing is copied over by default: each
// kept keyword is checked and rebuilt, and everything else is dropped.

import {
  escapeListedText,
  isJsonObject,
  maxEnumValues,
  passesNameRule,
  UntrustedText,
} from "./listed-tool-rules.ts";

/** Thrown inside the rebuild when the whole tool has to be refused. */
export class RefusedTool extends Error {
  override readonly name = "RefusedTool";
}

/** The rebuilt parameters, and where keywords were dropped. */
export interface RebuiltParameters {
  /** The new schema. Its `description` and `title` values are {@link UntrustedText}. */
  readonly parameters: Record<string, unknown>;
  /**
   * A JSON pointer to each dropped keyword, such as `/properties/city/pattern`,
   * with each keyword cut to 64 characters and escaped.
   */
  readonly dropped: readonly string[];
}

interface RebuildContext {
  /** The names kept under `$defs`, the only ones a `$ref` may point to. */
  readonly definitionNames: ReadonlySet<string>;
  /** `#/$defs/`, or `#/definitions/` when the source used the older keyword. */
  readonly refPrefix: string;
  readonly dropped: string[];
}

const jsonTypes = new Set(["string", "number", "integer", "boolean", "object", "array", "null"]);

const formats = new Set([
  "date-time",
  "date",
  "time",
  "duration",
  "email",
  "uri",
  "uuid",
  "ipv4",
  "ipv6",
  "hostname",
]);

/** The limit keywords, each with the value JSON Schema defines for it. */
const limits: Readonly<Record<string, (value: unknown) => boolean>> = {
  minimum: isFiniteNumber,
  maximum: isFiniteNumber,
  exclusiveMinimum: isFiniteNumber,
  exclusiveMaximum: isFiniteNumber,
  multipleOf: (value) => isFiniteNumber(value) && value > 0,
  minLength: isCount,
  maxLength: isCount,
  minItems: isCount,
  maxItems: isCount,
  minProperties: isCount,
  maxProperties: isCount,
  uniqueItems: (value) => typeof value === "boolean",
};

/**
 * Rebuilds a listed tool's `parameters`, keeping only the allowed keywords
 * at every depth. A root `definitions` is read as `$defs`, and its refs are
 * rewritten to `#/$defs/<name>`.
 *
 * @throws {RefusedTool} when a name breaks the name rule, a `$ref` doesn't
 *   point to a kept entry under `$defs`, or the root has both `definitions` and `$defs`
 */
export function rebuildParameters(listed: Record<string, unknown>): RebuiltParameters {
  const hasDefs = Object.hasOwn(listed, "$defs");
  const hasDefinitions = Object.hasOwn(listed, "definitions");
  if (hasDefs && hasDefinitions) {
    throw new RefusedTool("its parameters have both definitions and $defs at the root");
  }
  const definitionsKeyword = hasDefinitions ? "definitions" : "$defs";
  const { [definitionsKeyword]: definitions, ...root } = listed;
  const dropped: string[] = [];
  const definitionEntries = readDefinitions(definitions, `/${definitionsKeyword}`, dropped);
  const context: RebuildContext = {
    definitionNames: new Set(definitionEntries.map(([name]) => name)),
    refPrefix: `#/${definitionsKeyword}/`,
    dropped,
  };

  const parameters = rebuildSchema(root, "", context);
  if (definitionEntries.length > 0) {
    parameters["$defs"] = Object.fromEntries(
      definitionEntries.map(([name, schema]) => [
        name,
        rebuildSubschema(schema, `/$defs/${name}`, context),
      ]),
    );
  }
  return { parameters, dropped };
}

/** The entries under the root `$defs` that can be kept. Their names must pass the name rule. */
function readDefinitions(
  definitions: unknown,
  path: string,
  dropped: string[],
): Array<[string, Record<string, unknown> | boolean]> {
  if (definitions === undefined) {
    return [];
  }
  if (!isJsonObject(definitions)) {
    dropped.push(path);
    return [];
  }
  const kept: Array<[string, Record<string, unknown> | boolean]> = [];
  for (const [name, schema] of Object.entries(definitions)) {
    if (!passesNameRule(name)) {
      throw new RefusedTool(`a name under ${path} breaks the name rule`);
    }
    if (isJsonObject(schema) || typeof schema === "boolean") {
      kept.push([name, schema]);
    } else {
      dropped.push(`${path}/${name}`);
    }
  }
  return kept;
}

// Built with Object.fromEntries, so a property named `__proto__` stays an
// ordinary property instead of changing the object's prototype.
function rebuildSchema(
  schema: Record<string, unknown>,
  path: string,
  context: RebuildContext,
): Record<string, unknown> {
  const kept: Array<[string, unknown]> = [];
  for (const [keyword, value] of Object.entries(schema)) {
    const keywordPath = `${path}/${pointerSegment(keyword)}`;
    const rebuilt = rebuildKeyword(keyword, value, keywordPath, context);
    if (rebuilt === undefined) {
      context.dropped.push(keywordPath);
    } else {
      kept.push([keyword, rebuilt]);
    }
  }
  return Object.fromEntries(kept);
}

/** @returns the rebuilt value, or `undefined` to drop the keyword */
function rebuildKeyword(
  keyword: string,
  value: unknown,
  path: string,
  context: RebuildContext,
): unknown {
  switch (keyword) {
    case "type":
      return isJsonType(value) ? value : undefined;
    case "properties":
      return rebuildProperties(value, path, context);
    case "required":
      return readRequired(value, path);
    case "items":
    case "additionalProperties":
      return rebuildSubschema(value, path, context);
    case "prefixItems":
    case "anyOf":
    case "oneOf":
    case "allOf":
      return rebuildSchemaList(value, path, context);
    case "$ref":
      return rewriteRef(value, path, context);
    case "format":
      return typeof value === "string" && formats.has(value) ? value : undefined;
    case "enum":
      return isKeptEnum(value) ? value : undefined;
    case "const":
      return isKeptValue(value) ? value : undefined;
    case "description":
    case "title":
      return typeof value === "string" ? new UntrustedText(value) : undefined;
    default: {
      const isLimit = Object.hasOwn(limits, keyword) && limits[keyword]?.(value) === true;
      return isLimit ? value : undefined;
    }
  }
}

/** A schema is an object or, as JSON Schema allows, `true` or `false`. */
function rebuildSubschema(
  value: unknown,
  path: string,
  context: RebuildContext,
): Record<string, unknown> | boolean | undefined {
  if (typeof value === "boolean") {
    return value;
  }
  return isJsonObject(value) ? rebuildSchema(value, path, context) : undefined;
}

function rebuildSchemaList(
  value: unknown,
  path: string,
  context: RebuildContext,
): unknown[] | undefined {
  if (!Array.isArray(value) || value.length === 0) {
    return undefined;
  }
  const rebuilt = value.map((item, index) => rebuildSubschema(item, `${path}/${index}`, context));
  // Dropping one branch would change what the list means, so a list with a
  // branch of the wrong shape is dropped whole.
  return rebuilt.every((item) => item !== undefined) ? rebuilt : undefined;
}

function rebuildProperties(
  value: unknown,
  path: string,
  context: RebuildContext,
): Record<string, unknown> | undefined {
  if (!isJsonObject(value)) {
    return undefined;
  }
  const kept: Array<[string, unknown]> = [];
  for (const [name, schema] of Object.entries(value)) {
    if (!passesNameRule(name)) {
      throw new RefusedTool(`a property name in ${path} breaks the name rule`);
    }
    const rebuilt = rebuildSubschema(schema, `${path}/${name}`, context);
    if (rebuilt === undefined) {
      context.dropped.push(`${path}/${name}`);
    } else {
      kept.push([name, rebuilt]);
    }
  }
  return Object.fromEntries(kept);
}

function readRequired(value: unknown, path: string): string[] | undefined {
  if (!Array.isArray(value) || !value.every((name) => typeof name === "string")) {
    return undefined;
  }
  if (!value.every(passesNameRule)) {
    throw new RefusedTool(`a name in ${path} breaks the name rule`);
  }
  return [...value];
}

function rewriteRef(value: unknown, path: string, context: RebuildContext): string {
  if (typeof value === "string" && value.startsWith(context.refPrefix)) {
    const name = value.slice(context.refPrefix.length);
    if (context.definitionNames.has(name)) {
      return `#/$defs/${name}`;
    }
  }
  throw new RefusedTool(`the $ref at ${path} doesn't point to a kept entry under $defs`);
}

function isJsonType(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.length > 0 && value.every(isJsonType);
  }
  return typeof value === "string" && jsonTypes.has(value);
}

function isKeptEnum(value: unknown): boolean {
  return Array.isArray(value) && value.length <= maxEnumValues && value.every(isKeptValue);
}

/** An `enum` or `const` value: `null`, a boolean, a number, or a string that passes the name rule. */
function isKeptValue(value: unknown): boolean {
  return (
    value === null || typeof value === "boolean" || isFiniteNumber(value) || passesNameRule(value)
  );
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isCount(value: unknown): boolean {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

/**
 * A keyword as one JSON pointer segment. An unknown keyword is text the
 * server wrote, of any length, and the pointer ends up in a refusal's
 * reason, so it is cut and escaped.
 */
function pointerSegment(keyword: string): string {
  return escapeListedText(keyword).replaceAll("~", "~0").replaceAll("/", "~1");
}
