// The allow-list of requirement `ports.untrusted-tool-listings`: one reader
// per keyword the rebuild keeps. A reader returns the kept value, with the
// type `ListedSchema` declares for the keyword, or a `Dropped` that says why
// the keyword goes.

import { Dropped, wrongShape } from "./dropped.ts";
import { maxEnumValues } from "./limits.ts";
import type { JsonType, ListedFormat, ListedValue } from "./listed-schema.ts";
import { passesNameRule, showPath } from "./names.ts";
import type { ParametersReader } from "./parameters-reader.ts";

type KeywordReader = (value: unknown, path: string, reader: ParametersReader) => unknown;

const jsonTypes: ReadonlySet<string> = new Set<JsonType>([
  "null",
  "boolean",
  "object",
  "array",
  "number",
  "string",
  "integer",
]);

const formats: ReadonlySet<string> = new Set<ListedFormat>([
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

const numberLimits = ["minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum"];
const countLimits = [
  "minLength",
  "maxLength",
  "minItems",
  "maxItems",
  "minProperties",
  "maxProperties",
];
const schemaLists = ["prefixItems", "anyOf", "oneOf", "allOf"];

/** The keywords the rebuild keeps, each with its reader. A `Map`, so `__proto__` or `constructor` find nothing. */
export const keywordReaders: ReadonlyMap<string, KeywordReader> = new Map<string, KeywordReader>([
  ["type", readType],
  [
    "properties",
    (value, path, reader) => reader.readNamedSchemas(value, `${path}/properties`, "property"),
  ],
  ["required", readRequired],
  ["items", (value, path, reader) => reader.readSubschema(value, `${path}/items`)],
  ["additionalProperties", readAdditionalProperties],
  ["$defs", readDefs],
  ["$ref", (value, path, reader) => reader.readRef(value, path)],
  ...schemaLists.map((keyword): [string, KeywordReader] => [
    keyword,
    (value, path, reader) => reader.readSchemaList(value, `${path}/${keyword}`),
  ]),
  ...numberLimits.map((keyword): [string, KeywordReader] => [keyword, readFiniteNumber]),
  ["multipleOf", readPositiveNumber],
  ...countLimits.map((keyword): [string, KeywordReader] => [keyword, readCount]),
  ["uniqueItems", (value) => (typeof value === "boolean" ? value : wrongShape)],
  ["format", readFormat],
  ["enum", readEnum],
  ["const", readListedValue],
  ["description", (value, path, reader) => reader.readText(value, `${path}/description`)],
  ["title", (value, path, reader) => reader.readText(value, `${path}/title`)],
]);

function readType(value: unknown): JsonType | JsonType[] | Dropped {
  if (isJsonType(value)) {
    return value;
  }
  if (Array.isArray(value) && value.length > 0 && value.every(isJsonType)) {
    return [...value];
  }
  return wrongShape;
}

function isJsonType(value: unknown): value is JsonType {
  return typeof value === "string" && jsonTypes.has(value);
}

function readRequired(value: unknown, path: string, reader: ParametersReader): string[] | Dropped {
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === "string")) {
    return wrongShape;
  }
  for (const name of value) {
    if (!passesNameRule(name)) {
      reader.refuse(`a \`required\` string at ${showPath(path)} breaks the name rule`);
    }
  }
  return [...value];
}

function readAdditionalProperties(value: unknown, path: string, reader: ParametersReader): unknown {
  if (typeof value === "boolean") {
    return value;
  }
  return reader.readSubschema(value, `${path}/additionalProperties`);
}

function readDefs(value: unknown, path: string, reader: ParametersReader): unknown {
  if (path !== "") {
    return new Dropped("`$defs` is kept only at the root");
  }
  return reader.readNamedSchemas(value, "/$defs", "`$defs` name");
}

function readFiniteNumber(value: unknown): number | Dropped {
  return typeof value === "number" && Number.isFinite(value) ? value : wrongShape;
}

function readPositiveNumber(value: unknown): number | Dropped {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : wrongShape;
}

function readCount(value: unknown): number | Dropped {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    return wrongShape;
  }
  return value;
}

function readFormat(value: unknown): ListedFormat | Dropped {
  return isListedFormat(value) ? value : new Dropped("it isn't one of the kept formats");
}

function isListedFormat(value: unknown): value is ListedFormat {
  return typeof value === "string" && formats.has(value);
}

function readEnum(value: unknown): ListedValue[] | Dropped {
  if (!Array.isArray(value) || value.length === 0) {
    return wrongShape;
  }
  if (value.length > maxEnumValues) {
    return new Dropped(`it holds more than ${maxEnumValues} values`);
  }
  const kept: ListedValue[] = [];
  for (const entry of value) {
    const read = readListedValue(entry);
    if (read instanceof Dropped) {
      return read;
    }
    kept.push(read);
  }
  return kept;
}

function readListedValue(value: unknown): ListedValue | Dropped {
  if (value === null || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : wrongShape;
  }
  if (typeof value === "string") {
    return passesNameRule(value)
      ? value
      : new Dropped("it holds a string that breaks the name rule");
  }
  return wrongShape;
}
