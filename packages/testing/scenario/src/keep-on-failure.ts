import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { onTestFailed, type RunnerTestCase, TestRunner } from "vitest";

declare module "vitest" {
  interface TaskMeta {
    /** The files `keepOnFailure()` wrote when the test failed, relative to the working directory (`process.cwd()`). */
    keptOnFailure?: string[];
  }
}

/** Where {@link keepOnFailure} writes. */
export interface KeepOnFailureOptions {
  /** The folder for the files. Defaults to `test-results/scenarios` in the package, which git ignores. */
  readonly directory?: string;
}

/** A name for a kept file: lowercase words joined by dashes, such as `timer-records`. */
const keptNamePattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** The names each running test has kept so far in this attempt, so a second call with the same name throws. */
const namesKept = new WeakMap<object, { attempt: string; names: Set<string> }>();

/**
 * Saves state for the reader when the current test fails, and does nothing
 * when it passes. Call it inside a test, after setting up the world, with a
 * function that reads the state you would want to see: the store's records,
 * the logs, the listener's calls.
 *
 * On failure it writes what `collect` returned as JSON to
 * `<directory>/<test file>/<test name>/<name>.json`, prints the path, and
 * adds it to the test's `keptOnFailure` tag in `test-results/vitest.json`.
 * The file and test names become single, safe path segments; see
 * {@link pathSegment}. When `collect` throws, the file records that error
 * instead, and the test still fails with its own error.
 *
 * @param name - the kept file's name, in lowercase words joined by dashes
 * @param collect - reads the state to keep; may be async
 * @param options - where to write
 * @throws when `name` isn't lowercase words joined by dashes, when the test
 *   already kept a file with that name, or when called outside a test
 *
 * @example
 * it("delivers the timer after a restart", async () => {
 *   const world = newWorld();
 *   keepOnFailure("timer-records", () => world.store.changes("timers"));
 *   …
 * });
 */
export function keepOnFailure(
  name: string,
  collect: () => unknown,
  options: KeepOnFailureOptions = {},
): void {
  if (!keptNamePattern.test(name)) {
    throw new Error(
      `keepOnFailure: "${name}" isn't a good file name. Use lowercase words joined by dashes, such as "timer-records".`,
    );
  }
  rejectSecondName(name);
  const directory = options.directory ?? join(process.cwd(), "test-results", "scenarios");
  onTestFailed(async ({ task }) => {
    const file = join(
      directory,
      pathSegment(task.file.name),
      pathSegment(testTitle(task)),
      `${name}.json`,
    );
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, `${toJson(await collectSafely(collect))}\n`);
    const shown = relative(process.cwd(), file);
    task.meta.keptOnFailure = [...(task.meta.keptOnFailure ?? []), shown];
    console.error(`keepOnFailure: kept ${name} at ${shown}`);
  });
}

/** Throws when the running test already kept a file called `name`, which this call would overwrite. */
function rejectSecondName(name: string): void {
  const test = TestRunner.getCurrentTest();
  if (test === undefined) return; // onTestFailed says it needs a test.
  // A retry or repeat runs the same test again, and may keep the same names again.
  const attempt = `${test.result?.repeatCount ?? 0}:${test.result?.retryCount ?? 0}`;
  let kept = namesKept.get(test);
  if (kept?.attempt !== attempt) {
    kept = { attempt, names: new Set() };
    namesKept.set(test, kept);
  }
  if (kept.names.has(name)) {
    throw new Error(
      `keepOnFailure: this test already keeps "${name}", and a second one would overwrite it. Give each a different name.`,
    );
  }
  kept.names.add(name);
}

/** Runs `collect`, and turns its error into data, so it can't hide the test's own error. */
async function collectSafely(collect: () => unknown): Promise<unknown> {
  try {
    return { state: await collect() };
  } catch (error) {
    return { collectFailed: describeError(error) };
  }
}

/** The test's name with the names of the `describe` blocks around it, without the file. */
function testTitle(task: Readonly<RunnerTestCase>): string {
  const names = [task.name];
  for (let suite = task.suite; suite !== undefined && suite !== task.file; suite = suite.suite) {
    names.unshift(suite.name);
  }
  return names.join(" > ");
}

/** The longest path segment {@link pathSegment} returns. */
const segmentLength = 120;

/**
 * Turns a name into one path segment: anything but letters, digits, `.`,
 * `_` and `-` becomes `-`, as does a run of dots, and leading or trailing
 * dots and dashes go, so the result has no `..` and no separator. When that
 * changes the name, or it is longer than 120 characters, the segment is cut
 * to 111 and ends in `-` and 8 characters of the full name's hash, so two
 * names that only differ in what was changed or cut get different folders.
 */
export function pathSegment(text: string): string {
  const readable = text
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/\.{2,}/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[.-]+|[.-]+$/g, "");
  if (readable === text && text !== "" && text.length <= segmentLength) return text;
  const hash = createHash("sha256").update(text).digest("hex").slice(0, 8);
  const kept = readable.slice(0, segmentLength - hash.length - 1).replace(/[.-]+$/, "");
  return `${kept === "" ? "unnamed" : kept}-${hash}`;
}

/**
 * JSON that keeps what plain `JSON.stringify` drops or throws on: errors,
 * maps, sets, bigints and cycles. An object met a second time is written
 * once and then as `"[shown above]"`, which also ends any cycle.
 */
function toJson(value: unknown): string {
  const seen = new WeakSet<object>();
  return JSON.stringify(
    value,
    (_key, item: unknown) => {
      if (typeof item === "bigint") return item.toString();
      if (item instanceof Error) return describeError(item);
      if (item instanceof Map) return Object.fromEntries(item);
      if (item instanceof Set) return [...item];
      if (typeof item === "object" && item !== null) {
        if (seen.has(item)) return "[shown above]";
        seen.add(item);
      }
      return item;
    },
    2,
  );
}

function describeError(error: unknown): unknown {
  if (!(error instanceof Error)) return { thrown: String(error) };
  return { name: error.name, message: error.message, stack: error.stack };
}
