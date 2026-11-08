import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

/** What a case breaks on purpose. "valid" cases break nothing. */
export const faults = [
  "valid",
  "wrong-type",
  "unknown-key",
  "missing-required",
  "bad-enum",
  "bad-format",
  "deep-nesting",
  "yaml-syntax",
  "reference",
  "rule",
] as const;
export type Fault = (typeof faults)[number];

/** Where the fault really is, written by hand: the line a person would want to be sent to. */
export interface ExpectedError {
  /** The file on disk, relative to the workspace root. */
  readonly file: string;
  /** The key path inside the file, dot-separated ("" for the whole file). */
  readonly path: string;
  /** 1-based line of the faulty value or key; null when no line applies (a missing file). */
  readonly line: number | null;
}

/** One fixture: the base workspace, changed by this case's files and removals. */
export interface ParityCase {
  /** "base", or "<kind>/<name>" for a case under fixtures/cases. */
  readonly id: string;
  /** The folder holding case.json, files/ and recorded.json. */
  readonly folder: string;
  readonly about: string;
  readonly kind: string;
  readonly fault: Fault;
  /** Base files this case deletes, relative to the workspace root. */
  readonly remove: readonly string[];
  readonly expect: ExpectedError | null;
  /** This case's own files, relative to the workspace root, sorted. */
  readonly files: readonly string[];
}

/** Every file under a folder, as sorted "/"-separated paths relative to it. */
export function listFiles(folder: string): string[] {
  if (!existsSync(folder)) {
    return [];
  }
  const found: string[] = [];
  const walk = (current: string): void => {
    for (const name of readdirSync(current)) {
      const path = join(current, name);
      if (statSync(path).isDirectory()) {
        walk(path);
      } else {
        found.push(relative(folder, path).split(sep).join("/"));
      }
    }
  };
  walk(folder);
  return found.sort();
}

function text(value: unknown, field: string, where: string): string {
  if (typeof value !== "string" || value === "") {
    throw new Error(`${where}: "${field}" must be a non-empty string`);
  }
  return value;
}

function readExpect(value: unknown, where: string): ExpectedError | null {
  if (value === undefined) {
    return null;
  }
  if (typeof value !== "object" || value === null) {
    throw new Error(`${where}: "expect" must be an object`);
  }
  const fields = value as Record<string, unknown>;
  const line = fields["line"];
  if (line !== null && (typeof line !== "number" || !Number.isInteger(line) || line < 1)) {
    throw new Error(`${where}: "expect.line" must be a line number from 1, or null`);
  }
  const path = fields["path"];
  if (typeof path !== "string") {
    throw new Error(`${where}: "expect.path" must be a string`);
  }
  return { file: text(fields["file"], "expect.file", where), path, line };
}

function readRemove(value: unknown, where: string): string[] {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new Error(`${where}: "remove" must be a list of paths`);
  }
  return value;
}

/**
 * Reads one case.json and lists the case's files. Throws with the case's id
 * when the description is malformed, so a typo never records silently.
 */
export function readCase(id: string, folder: string): ParityCase {
  const where = `case ${id}`;
  const raw: unknown = JSON.parse(readFileSync(join(folder, "case.json"), "utf8"));
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error(`${where}: case.json must hold an object`);
  }
  const fields = raw as Record<string, unknown>;
  const fault = text(fields["fault"], "fault", where);
  if (!(faults as readonly string[]).includes(fault)) {
    throw new Error(`${where}: unknown fault "${fault}" (one of ${faults.join(", ")})`);
  }
  const expect = readExpect(fields["expect"], where);
  if (fault !== "valid" && expect === null) {
    throw new Error(`${where}: a case with a fault needs "expect"`);
  }
  return {
    id,
    folder,
    about: text(fields["about"], "about", where),
    kind: text(fields["kind"], "kind", where),
    fault: fault as Fault,
    remove: readRemove(fields["remove"], where),
    expect,
    files: listFiles(join(folder, "files")),
  };
}

/** The base workspace and every case under fixtures/cases/<kind>/<name>, in a stable order. */
export function loadCases(fixtures: string): ParityCase[] {
  const cases = [readCase("base", join(fixtures, "base"))];
  const root = join(fixtures, "cases");
  for (const kind of existsSync(root) ? readdirSync(root).sort() : []) {
    for (const name of readdirSync(join(root, kind)).sort()) {
      cases.push(readCase(`${kind}/${name}`, join(root, kind, name)));
    }
  }
  return cases;
}
