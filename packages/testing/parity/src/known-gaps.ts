import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { baseCliCalls } from "./cli-calls.ts";

/**
 * A place where the new engine still does something other than the old one
 * and is wrong: not an allowed difference, but work with a task. The
 * run-log and the CLI compare report the tests and calls it names as gaps,
 * not failures, until the task fixes them; a gap whose tests or calls match
 * is stale and fails the compare, so the list only shrinks.
 */
export interface KnownGap {
  /** Stable kebab-case name of this gap, unique in the file. */
  readonly id: string;
  /** The task that fixes it, for example "HAL-1541". */
  readonly task: string;
  /** What the gap is about, in a few words. */
  readonly area: string;
  /** What the old repo (784f78d) did. */
  readonly old: string;
  /** What the new repo does instead. */
  readonly new: string;
  /** The base fixture's workflow tests it shows in, as `<hub>/<workflow>/<name>`. */
  readonly tests?: readonly string[];
  /** The base fixture's CLI calls it shows in, by their name in `cli-calls.ts`. */
  readonly calls?: readonly string[];
}

/** The package's own known-gaps file. */
export const knownGapsFile = fileURLToPath(new URL("../known-gaps.json", import.meta.url));

const idPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const taskPattern = /^HAL-\d+$/;
const fields = ["id", "task", "area", "old", "new", "tests", "calls"] as const;
const callNames: readonly string[] = baseCliCalls.map((call) => call.name);

function text(entry: Record<string, unknown>, field: string, where: string): string {
  const value = entry[field];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${where}: "${field}" must be a non-empty string`);
  }
  return value;
}

const listShapes = {
  tests: 'list tests as "<hub>/<workflow>/<name>"',
  calls: "list calls by their name in cli-calls.ts",
};

/** The entry's `tests` or `calls`: left out, or a list of at least one valid name. */
function list(
  entry: Record<string, unknown>,
  field: "tests" | "calls",
  valid: (name: string) => boolean,
  where: string,
): string[] | undefined {
  const value = entry[field];
  if (value === undefined) return undefined;
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    !value.every((name) => typeof name === "string" && valid(name))
  ) {
    throw new Error(`${where}: "${field}" must ${listShapes[field]}`);
  }
  return value as string[];
}

function readGap(raw: unknown, where: string): KnownGap {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error(`${where}: each gap must be an object`);
  }
  const entry = raw as Record<string, unknown>;
  const unknown = Object.keys(entry).filter((key) => !(fields as readonly string[]).includes(key));
  if (unknown.length > 0) {
    throw new Error(`${where}: unknown field "${unknown[0]}" (fields: ${fields.join(", ")})`);
  }
  const id = text(entry, "id", where);
  if (!idPattern.test(id)) throw new Error(`${where}: id "${id}" must be kebab-case`);
  const task = text(entry, "task", where);
  if (!taskPattern.test(task)) throw new Error(`${where}: task "${task}" must look like "HAL-123"`);
  const tests = list(entry, "tests", (test) => test.split("/").length >= 3, where);
  const calls = list(entry, "calls", (call) => callNames.includes(call), where);
  if (tests === undefined && calls === undefined) {
    throw new Error(`${where}: list the tests or the calls it shows in`);
  }
  return {
    id,
    task,
    area: text(entry, "area", where),
    old: text(entry, "old", where),
    new: text(entry, "new", where),
    ...(tests === undefined ? {} : { tests }),
    ...(calls === undefined ? {} : { calls }),
  };
}

/**
 * Checks the known gaps and returns them. Throws naming the entry when one
 * is malformed or an id repeats, so a test is never excused by a typo.
 */
export function parseKnownGaps(raw: unknown): KnownGap[] {
  if (!Array.isArray(raw)) throw new Error("known gaps: the file must hold a list");
  const seen = new Set<string>();
  return raw.map((item, index) => {
    const where = `known gap ${index + 1}`;
    const gap = readGap(item, where);
    if (seen.has(gap.id)) throw new Error(`${where}: id "${gap.id}" is used twice`);
    seen.add(gap.id);
    return gap;
  });
}

/** Reads and checks a known-gaps file. */
export function readKnownGaps(file: string): KnownGap[] {
  return parseKnownGaps(JSON.parse(readFileSync(file, "utf8")));
}
