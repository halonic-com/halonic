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
 * show. Each unrecognized key gets an issue of its own, which names the field
 * and asks "Did you mean …?" when one the map allows and doesn't have is a
 * near spelling (HAL-14261). Codes and paths stay Zod's.
 *
 * @param issues - the schema's issues for one file
 * @param data - the data the schema got, to tell a missing key from a wrong value
 *
 * @example
 * // { id: "clerk", modle: "smart" } for an agent:
 * wordIssues(issues, data).map((issue) => issue.message);
 * // ['There's no field "modle" in this file. Did you mean "model"?']
 */
export function wordIssues(issues: readonly Issue[], data: unknown): Issue[] {
  const missing = issues.filter((issue) => isMissingKey(issue, data));
  return issues.flatMap((issue) => {
    if (missing.includes(issue)) {
      return [{ ...issue, message: `Missing required key "${String(issue.path.at(-1))}"` }];
    }
    if (issue.code === "unrecognized_keys" && issue.keys !== undefined) {
      return unknownFieldIssues(issue, issue.keys, missingKeysIn(missing, issue.path), data);
    }
    return [issue];
  });
}

/**
 * One issue per unrecognized key, still at its map's path, with `keys` naming
 * only that key. The guesses are the keys the map allows and doesn't have;
 * without the schema's keys, only the missing required ones.
 */
function unknownFieldIssues(
  issue: Issue,
  unrecognized: readonly string[],
  missing: readonly string[],
  data: unknown,
): Issue[] {
  const map = valueAt(data, issue.path);
  const absent = (key: string) => !(isMap(map) && Object.hasOwn(map, key));
  const candidates = issue.knownKeys?.filter(absent) ?? missing;
  const where = issue.path.length === 0 ? "this file" : `"${formatPath(issue.path)}"`;
  return unrecognized.map((key) => {
    const near = nearestKey(key, candidates);
    const guess = near === undefined ? "" : ` Did you mean "${near}"?`;
    return { ...issue, keys: [key], message: `There's no field "${key}" in ${where}.${guess}` };
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
 * The candidate closest to a misspelled key, or `undefined` when none is near
 * or two are equally near. A key must keep more than it changes, so a short
 * key like `x` doesn't guess every two-letter field.
 */
function nearestKey(key: string, candidates: readonly string[]): string | undefined {
  const near = candidates
    .map((candidate) => ({ candidate, distance: editDistance(key, candidate) }))
    .filter(({ distance }) => distance <= nearDistance && distance < key.length)
    .sort((a, b) => a.distance - b.distance);
  const [first, second] = near;
  return first !== undefined && first.distance !== second?.distance ? first.candidate : undefined;
}

/**
 * The fewest single-character insertions, deletions, substitutions and swaps
 * of two neighbours that turn `from` into `to`, so "nmae" and "name" are one apart.
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
