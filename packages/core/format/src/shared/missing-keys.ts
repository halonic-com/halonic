import { formatPath, type Issue, type Path } from "@halonicjs/schema-kit";
import { nearMatch } from "@halonicjs/std";
import { isMap } from "./legacy-keys.ts";

/**
 * Words the schema's issues the way a person fixes them (HAL-12126). A
 * required key that isn't there says so by name, instead of Zod's "Invalid
 * input: expected string, received undefined", whose path the line doesn't
 * show. An unrecognized key next to it that is a near spelling of a missing
 * key asks "Did you mean …?". Codes and paths stay Zod's.
 *
 * @param issues - the schema's issues for one file
 * @param data - the data the schema got, to tell a missing key from a wrong value
 *
 * @example
 * // { nmae: "Acme" } for a kind that needs `name`:
 * wordIssues(issues, data).map((issue) => issue.message);
 * // ['Missing required key "name"', 'Unrecognized key: "nmae". Did you mean "name"?']
 */
export function wordIssues(issues: readonly Issue[], data: unknown): Issue[] {
  const missing = issues.filter((issue) => isMissingKey(issue, data));
  return issues.map((issue) => {
    if (missing.includes(issue)) {
      return { ...issue, message: `Missing required key "${String(issue.path.at(-1))}"` };
    }
    if (issue.code === "unrecognized_keys" && issue.keys !== undefined) {
      const near = nearMissingKeys(issue.keys, missingKeysIn(missing, issue.path));
      return near === "" ? issue : { ...issue, message: `${issue.message}. ${near}` };
    }
    return issue;
  });
}

/** Whether Zod found a wrong type because the key isn't in its map at all. */
function isMissingKey(issue: Issue, data: unknown): boolean {
  const key = issue.path.at(-1);
  if (issue.code !== "invalid_type" || typeof key !== "string") {
    return false;
  }
  const parent = valueAt(data, issue.path.slice(0, -1));
  return isMap(parent) && !Object.hasOwn(parent, key);
}

/** The value at a path, or `undefined` when a step of it isn't there. */
function valueAt(data: unknown, path: Path): unknown {
  let value = data;
  for (const segment of path) {
    if (Array.isArray(value) && typeof segment === "number") {
      value = value[segment];
    } else if (isMap(value) && typeof segment === "string" && Object.hasOwn(value, segment)) {
      value = value[segment];
    } else {
      return undefined;
    }
  }
  return value;
}

/** The missing keys of the map at `path`. */
function missingKeysIn(missing: readonly Issue[], path: Path): string[] {
  const where = formatPath(path);
  return missing
    .filter((issue) => formatPath(issue.path.slice(0, -1)) === where)
    .map((issue) => String(issue.path.at(-1)));
}

/**
 * "Did you mean "name"?" for one unrecognized key, or with the key named for
 * several: 'Did you mean "name" for "nmae"?'. A key with no missing key
 * within two edits of it, or with two equally likely, gets no guess.
 */
function nearMissingKeys(unrecognized: readonly string[], missing: readonly string[]): string {
  const pairs = unrecognized.flatMap((key) => {
    const near = nearMatch(key, missing);
    return near === undefined ? [] : [{ key, near }];
  });
  if (pairs.length === 0) {
    return "";
  }
  if (unrecognized.length === 1) {
    return `Did you mean "${pairs[0]?.near}"?`;
  }
  return `Did you mean ${pairs.map(({ key, near }) => `"${near}" for "${key}"`).join(", ")}?`;
}
