import { formatPath, type Issue, type Path } from "@halonicjs/schema-kit";
import { isMap } from "./legacy-keys.ts";

/**
 * How far a misspelled key may be from a missing one for "did you mean": the
 * CLI's limit for a typed command (cli-output 1.3), so "nmae" finds "name".
 */
const nearDistance = 2;

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
 * near it, or with two equally likely, gets no guess.
 */
function nearMissingKeys(unrecognized: readonly string[], missing: readonly string[]): string {
  const pairs = unrecognized.flatMap((key) => {
    const near = missing.filter((candidate) => editDistance(key, candidate) <= nearDistance);
    return near.length === 1 ? [{ key, near: near[0] }] : [];
  });
  if (pairs.length === 0) {
    return "";
  }
  if (unrecognized.length === 1) {
    return `Did you mean "${pairs[0]?.near}"?`;
  }
  return `Did you mean ${pairs.map(({ key, near }) => `"${near}" for "${key}"`).join(", ")}?`;
}

/**
 * The fewest single-character insertions, deletions, substitutions and swaps
 * of two neighbours that turn `from` into `to`, so "nmae" is one from "name".
 * The CLI has its own copy for commands; core can't use the CLI's.
 */
function editDistance(from: string, to: string): number {
  const width = to.length + 1;
  const cells = new Array<number>((from.length + 1) * width).fill(0);
  const at = (i: number, j: number) => cells[i * width + j] ?? 0;
  for (let i = 0; i <= from.length; i += 1) {
    for (let j = 0; j <= to.length; j += 1) {
      if (i === 0 || j === 0) {
        cells[i * width + j] = i + j;
        continue;
      }
      const cost = from[i - 1] === to[j - 1] ? 0 : 1;
      let best = Math.min(at(i - 1, j) + 1, at(i, j - 1) + 1, at(i - 1, j - 1) + cost);
      if (i > 1 && j > 1 && from[i - 1] === to[j - 2] && from[i - 2] === to[j - 1]) {
        best = Math.min(best, at(i - 2, j - 2) + 1);
      }
      cells[i * width + j] = best;
    }
  }
  return at(from.length, to.length);
}
