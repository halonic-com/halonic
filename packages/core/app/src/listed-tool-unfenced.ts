// The unfenced channel of a listed tool (`ports.untrusted-tool-listings`).
// The model sends some strings back in calls, so they can't be fenced. One
// string carries at most 64 characters, but several can be chained into an
// instruction, so their total per tool is capped as well.

import { isJsonObject } from "./listed-tool-rules.ts";

/** The most characters of unfenced text one listed tool may hold. */
export const maxUnfencedLength = 2048;

/**
 * Adds up the length of every unfenced string a listed tool holds, each time
 * it appears: its name, and in its rebuilt parameters the property names,
 * `required` strings, `$defs` names and the strings in `enum` and `const`.
 *
 * `type`, `format` and the limits hold only words from the allow-list, and
 * a `$ref` only repeats a `$defs` name, so the requirement doesn't count them.
 *
 * @param parameters - already rebuilt from the allow-list, so it nests at most 64 levels
 */
export function unfencedLength(name: string, parameters: Record<string, unknown>): number {
  return name.length + schemaUnfencedLength(parameters);
}

function schemaUnfencedLength(schema: unknown): number {
  if (!isJsonObject(schema)) {
    return 0;
  }
  let total = 0;
  for (const [keyword, value] of Object.entries(schema)) {
    switch (keyword) {
      case "properties":
      case "$defs":
        total += namedSchemasLength(value);
        break;
      case "required":
      case "enum":
        total += stringsLength(value);
        break;
      case "const":
        total += stringsLength([value]);
        break;
      case "items":
      case "additionalProperties":
        total += schemaUnfencedLength(value);
        break;
      case "prefixItems":
      case "anyOf":
      case "oneOf":
      case "allOf":
        total += Array.isArray(value) ? sum(value.map(schemaUnfencedLength)) : 0;
        break;
    }
  }
  return total;
}

function namedSchemasLength(value: unknown): number {
  if (!isJsonObject(value)) {
    return 0;
  }
  return sum(
    Object.entries(value).map(([name, schema]) => name.length + schemaUnfencedLength(schema)),
  );
}

function stringsLength(value: unknown): number {
  if (!Array.isArray(value)) {
    return 0;
  }
  return sum(value.map((item) => (typeof item === "string" ? item.length : 0)));
}

function sum(lengths: readonly number[]): number {
  return lengths.reduce((total, length) => total + length, 0);
}
