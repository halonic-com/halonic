import type { CheckContext } from "../lib/context.ts";
import { Report } from "../lib/problems.ts";
import { isSourceFile, isTestFile } from "../lib/source-files.ts";
import { owningPackage } from "../lib/workspace.ts";
import { layerOf } from "./layer-table.ts";

const guide = "See docs/guides/checks.md (process-starts).";

/** The allow-list of files that may start processes. */
export const startersPath = "tooling/check/process-starters.json";

/**
 * The Node modules that start a process or run code in a new thread. Any of
 * them could run a file under a skill's `scripts/` folder, which Halonic never does.
 */
const starterModules: readonly string[] = [
  "child_process",
  "node:child_process",
  "worker_threads",
  "node:worker_threads",
  "cluster",
  "node:cluster",
];

/** One entry of `process-starters.json`. */
interface Starter {
  readonly reason: string;
  /** The test that shows the file never starts a file under a skill's `scripts/` folder. */
  readonly scriptsTest: string;
}

/** A place in a file that can start a process: an import or a load the check can't follow. */
interface StartSite {
  /** What the file does there, such as `imports "node:child_process"`. */
  readonly what: string;
  readonly line: number;
}

/**
 * Only the files listed in `tooling/check/process-starters.json` may import
 * `child_process`, `worker_threads` or `cluster`, or load a module the check
 * can't follow (`import(x)`, `createRequire`, `process.getBuiltinModule`).
 * Each entry gives a reason and names a test that shows the file never
 * starts a file under a skill's `scripts/` folder. Tests and testing and
 * tooling packages are exempt: they never ship.
 */
export function checkProcessStarts(context: CheckContext): Report {
  const report = new Report("process-starts");
  const starters = readStarters(context, report);
  const starting = new Set<string>();
  for (const file of context.files) {
    const sites = startSites(context, file);
    if (sites.length === 0) {
      continue;
    }
    starting.add(file);
    if (Object.hasOwn(starters, file)) {
      continue;
    }
    for (const site of sites) {
      report.error(
        file,
        `${site.what}, which can start a process. Only files listed in ${startersPath} may. Add an entry for this file with a "reason" and a "scriptsTest" that shows it never starts a file under a skill's scripts/ folder; the entry needs Liam's review. ${guide}`,
        site.line,
      );
    }
  }
  for (const [file, starter] of Object.entries(starters)) {
    checkEntry(context, file, starter, starting.has(file), report);
  }
  return report;
}

/**
 * The places in a shipped source file that can start a process; none for
 * exempt files. A hidden load counts because it could load any of the
 * modules above under a name the check can't see. Tool config files
 * (`vitest.config.ts`) aren't exempt: shipped code could import one and
 * re-export what it imports.
 */
function startSites(context: CheckContext, file: string): StartSite[] {
  if (!isSourceFile(file) || isTestFile(file)) {
    return [];
  }
  const pkg = owningPackage(file, context.packages);
  if (pkg === undefined) {
    return [];
  }
  const layer = layerOf(context, pkg);
  if (layer === "tooling" || layer === "testing") {
    return [];
  }
  const facts = context.sourceFacts(file);
  const imports = facts.imports
    .filter((reference) => starterModules.includes(reference.specifier))
    .map((reference) => ({ what: `imports "${reference.specifier}"`, line: reference.line }));
  // `/// <reference>` directives only load types, so they can't start anything.
  const hidden = facts.hiddenLoads
    .filter((load) => !load.what.startsWith("/// <reference"))
    .map((load) => ({ what: `uses ${load.what}`, line: load.line }));
  return [...imports, ...hidden];
}

function checkEntry(
  context: CheckContext,
  file: string,
  starter: Starter,
  starts: boolean,
  report: Report,
): void {
  const at = `starters["${file}"]`;
  if (!starts) {
    const why = context.files.includes(file)
      ? "no longer imports child_process, worker_threads or cluster or loads a module the check can't follow (or is exempt)"
      : "doesn't exist";
    report.error(startersPath, `${at}: the file ${why}. Remove the entry. ${guide}`);
  }
  if (starter.reason.trim() === "") {
    report.error(startersPath, `${at} needs a reason. ${guide}`);
  }
  if (!isTestFile(starter.scriptsTest) || !context.files.includes(starter.scriptsTest)) {
    report.error(
      startersPath,
      `${at}.scriptsTest "${starter.scriptsTest}" must be an existing test file that shows the file never starts a file under a skill's scripts/ folder. ${guide}`,
    );
  }
}

/** The entries of the allow-list, or none after reporting one error when it is missing or malformed. */
function readStarters(context: CheckContext, report: Report): Record<string, Starter> {
  if (!context.files.includes(startersPath)) {
    report.error(
      startersPath,
      `The file is missing. Keep it, with an empty "starters" object when no file starts a process. ${guide}`,
    );
    return {};
  }
  try {
    return parseStarters(context.read(startersPath));
  } catch (error) {
    report.error(startersPath, `${(error as Error).message}. ${guide}`);
    return {};
  }
}

/**
 * Reads the allow-list strictly: an unknown key or a field of the wrong type
 * is an error, so a typo can't quietly let a file through.
 *
 * @throws naming the first thing that is wrong
 */
function parseStarters(text: string): Record<string, Starter> {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error("the file isn't valid JSON");
  }
  const file = asRecord(value, "the file");
  onlyKeys(file, "the file", ["starters"]);
  const entries = asRecord(file["starters"], '"starters"');
  // Built with fromEntries, so a "__proto__" entry stays an entry and is checked.
  const starters: [string, Starter][] = [];
  for (const [path, raw] of Object.entries(entries)) {
    const at = `starters["${path}"]`;
    const entry = asRecord(raw, at);
    onlyKeys(entry, at, ["reason", "scriptsTest"]);
    const { reason, scriptsTest } = entry;
    if (typeof reason !== "string" || typeof scriptsTest !== "string") {
      throw new Error(`${at} needs "reason" and "scriptsTest", both strings`);
    }
    starters.push([path, { reason, scriptsTest }]);
  }
  return Object.fromEntries(starters);
}

function asRecord(value: unknown, at: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${at} must be an object`);
  }
  return value as Record<string, unknown>;
}

/** Fails on a key that isn't `known`; a `//` comment is always allowed. */
function onlyKeys(record: Record<string, unknown>, at: string, known: readonly string[]): void {
  const unknownKey = Object.keys(record).find((key) => key !== "//" && !known.includes(key));
  if (unknownKey !== undefined) {
    throw new Error(`${at}: "${unknownKey}" is not a known key (known: ${known.join(", ")})`);
  }
}
