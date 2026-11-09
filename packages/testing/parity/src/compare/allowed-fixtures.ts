import type { Problem, Side } from "./compare.ts";
import type { CheckMessage } from "./loader-checks.ts";

/**
 * One fixture file an allowed difference lets differ, with both results
 * written out in full, so the entry allows exactly that difference.
 */
export interface AllowedFixture {
  /** The case id, such as `skill/wrong-type`, or `base`. */
  readonly case: string;
  /** The file on disk, relative to the workspace root. */
  readonly file: string;
  readonly old: Side;
  readonly new: Side;
}

type Fields = Record<string, unknown>;

function fieldsOf(value: unknown, where: string): Fields {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${where} must be an object`);
  }
  return value as Fields;
}

function text(fields: Fields, key: string, where: string): string {
  const value = fields[key];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${where}: "${key}" must be a non-empty string`);
  }
  return value;
}

function listOf(fields: Fields, key: string, where: string): unknown[] {
  const value = fields[key];
  if (!Array.isArray(value)) {
    throw new Error(`${where}: "${key}" must be a list`);
  }
  return value;
}

function position(value: unknown, where: string): number | null {
  if (value === null || (typeof value === "number" && Number.isInteger(value) && value >= 1)) {
    return value;
  }
  throw new Error(`${where} must be a number from 1, or null`);
}

function readProblem(value: unknown, where: string): Problem {
  const fields = fieldsOf(value, where);
  const path = listOf(fields, "path", where);
  if (!path.every((key) => typeof key === "string" || typeof key === "number")) {
    throw new Error(`${where}: "path" holds only keys and indexes`);
  }
  return {
    path: path as (string | number)[],
    code: text(fields, "code", where),
    line: position(fields["line"], `${where}: "line"`),
    col: position(fields["col"], `${where}: "col"`),
  };
}

function readSide(value: unknown, where: string): Side {
  const fields = fieldsOf(value, where);
  const status = fields["status"];
  if (status !== "pass" && status !== "fail") {
    throw new Error(`${where}: "status" must be "pass" or "fail"`);
  }
  const problems = listOf(fields, "problems", where);
  return { status, problems: problems.map((p, i) => readProblem(p, `${where}.problems[${i}]`)) };
}

function readFixture(value: unknown, where: string): AllowedFixture {
  const fields = fieldsOf(value, where);
  return {
    case: text(fields, "case", where),
    file: text(fields, "file", where),
    old: readSide(fields["old"], `${where}.old`),
    new: readSide(fields["new"], `${where}.new`),
  };
}

/**
 * Reads an entry's `fixtures` list. Throws on anything malformed, so an
 * entry can't allow more than it writes out.
 */
export function readAllowedFixtures(value: unknown, where: string): AllowedFixture[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${where}: "fixtures" must be a list of at least one fixture file`);
  }
  return value.map((item, index) => readFixture(item, `${where}: fixtures[${index}]`));
}

/**
 * One fixture file whose messages from checks between files an allowed
 * difference lets differ, with both sides written out in full, in order.
 */
export interface AllowedCheck {
  /** The case id, such as `routine/bad-cron`, or `base`. */
  readonly case: string;
  /** The file on disk, relative to the workspace root; a folder for an old layout. */
  readonly file: string;
  readonly old: readonly CheckMessage[];
  readonly new: readonly CheckMessage[];
}

const severities: readonly string[] = ["error", "warning", "info"];

/** Throws on a key outside `known`, so a misspelt one isn't silently dropped. */
function onlyKnown(fields: Fields, known: readonly string[], where: string): void {
  const unknown = Object.keys(fields).find((key) => !known.includes(key));
  if (unknown !== undefined) {
    throw new Error(`${where}: unknown field "${unknown}" (fields: ${known.join(", ")})`);
  }
}

function readMessage(value: unknown, where: string): CheckMessage {
  const fields = fieldsOf(value, where);
  onlyKnown(fields, ["severity", "message"], where);
  const severity = fields["severity"];
  if (typeof severity !== "string" || !severities.includes(severity)) {
    throw new Error(`${where}: "severity" must be one of ${severities.join(", ")}`);
  }
  return {
    severity: severity as CheckMessage["severity"],
    message: text(fields, "message", where),
  };
}

function readMessages(fields: Fields, key: string, where: string): CheckMessage[] {
  return listOf(fields, key, where).map((m, i) => readMessage(m, `${where}.${key}[${i}]`));
}

function readCheck(value: unknown, where: string): AllowedCheck {
  const fields = fieldsOf(value, where);
  onlyKnown(fields, ["case", "file", "old", "new"], where);
  return {
    case: text(fields, "case", where),
    file: text(fields, "file", where),
    old: readMessages(fields, "old", where),
    new: readMessages(fields, "new", where),
  };
}

/**
 * Reads an entry's `checks` list. Throws on anything malformed, so an entry
 * can't allow more than it writes out.
 */
export function readAllowedChecks(value: unknown, where: string): AllowedCheck[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${where}: "checks" must be a list of at least one fixture file`);
  }
  return value.map((item, index) => readCheck(item, `${where}: checks[${index}]`));
}
