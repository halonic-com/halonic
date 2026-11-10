import type { GoldenOutput, GoldenRun } from "./golden.ts";

/** An ANSI escape sequence, as the colour mode writes them. */
// biome-ignore lint/suspicious/noControlCharactersInRegex: escape codes are what this finds
const escapeCode = /\u001b\[[0-9;]*m/g;

/** What the command's output may do that most commands' can't. */
export interface ChecklistOptions {
  /** The command prints a report whose summary can be a ✕ line, as `validate` and `test` do. */
  readonly reportOnStdout?: boolean;
}

/**
 * What a golden run breaks of the design's checklist (cli-output section 5),
 * as one sentence per problem; empty when it keeps every point a test can
 * check:
 *
 * - **Exit code:** the same in all three modes.
 * - **No colour needed:** no escape codes with `NO_COLOR` or `--json`, and
 *   the same words with and without colour.
 * - **Streams:** no ✕ line on stdout. A report, such as `validate`'s, may
 *   end with its ✕ summary there (cli-output section 2: the result goes to
 *   stdout, even when it found errors), so with `reportOnStdout` only an
 *   error's own "✕ Couldn't …" line counts.
 * - **`--json`:** stdout is one JSON document that starts with
 *   `outputVersion` 1 and `ok`, `ok` is true only for exit code 0, an
 *   `error` has its `kind` and `message`, and stderr is empty. A command
 *   that returns a failure, such as `validate` with its problems, has no
 *   `error`; one that throws has.
 *
 * Help, which stays text with `--json`, isn't a golden run.
 *
 * @example
 * expect(checklistProblems(await runGolden(["schema"], () => [schemaCommand]))).toEqual([]);
 */
export function checklistProblems(run: GoldenRun, options: ChecklistOptions = {}): string[] {
  return [
    ...exitCodeProblems(run),
    ...colourProblems(run),
    ...streamProblems(run.noColour, options.reportOnStdout === true),
    ...jsonProblems(run.json),
  ];
}

function exitCodeProblems({ colour, noColour, json }: GoldenRun): string[] {
  if (colour.exit === noColour.exit && colour.exit === json.exit) {
    return [];
  }
  return [
    `The exit code differs: ${colour.exit} with colour, ${noColour.exit} with NO_COLOR, ${json.exit} with --json.`,
  ];
}

function colourProblems({ colour, noColour, json }: GoldenRun): string[] {
  const problems: string[] = [];
  if (hasEscapes(noColour)) {
    problems.push("The NO_COLOR output has escape codes.");
  }
  if (hasEscapes(json)) {
    problems.push("The --json output has escape codes.");
  }
  const uncoloured = { stdout: colour.stdout.map(plain), stderr: colour.stderr.map(plain) };
  const same =
    sameLines(uncoloured.stdout, noColour.stdout) && sameLines(uncoloured.stderr, noColour.stderr);
  if (!same) {
    problems.push("The colour output says something else than the NO_COLOR output.");
  }
  return problems;
}

function streamProblems(output: GoldenOutput, reportOnStdout: boolean): string[] {
  const errorStart = reportOnStdout ? "✕ Couldn't" : "✕";
  const errorLine = output.stdout.find((line) => line.startsWith(errorStart));
  return errorLine === undefined ? [] : [`An error line went to stdout: ${errorLine}`];
}

function jsonProblems({ exit, stdout, stderr }: GoldenOutput): string[] {
  const problems = stderr.length === 0 ? [] : ["With --json, stderr isn't empty."];
  const [text, ...more] = stdout;
  if (text === undefined || more.length > 0) {
    return [...problems, `With --json, stdout has ${stdout.length} documents instead of one.`];
  }
  const document = parsedObject(text);
  if (document === undefined) {
    return [...problems, "With --json, stdout isn't a JSON object."];
  }
  return [...problems, ...documentProblems(document, exit)];
}

function documentProblems(document: Readonly<Record<string, unknown>>, exit: number): string[] {
  const problems: string[] = [];
  const [first, second] = Object.keys(document);
  if (first !== "outputVersion" || document["outputVersion"] !== 1 || second !== "ok") {
    problems.push("The --json document doesn't start with outputVersion 1 and ok.");
  }
  if (document["ok"] !== (exit === 0)) {
    problems.push(
      `The --json document says ok is ${document["ok"]}, but the exit code is ${exit}.`,
    );
  }
  if ("error" in document && !isError(document["error"])) {
    problems.push("The --json document has an error without its kind and message.");
  }
  return problems;
}

function isError(value: unknown): boolean {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const { kind, message } = value as Readonly<Record<string, unknown>>;
  return typeof kind === "string" && typeof message === "string";
}

function parsedObject(text: string): Readonly<Record<string, unknown>> | undefined {
  try {
    const value: unknown = JSON.parse(text);
    const isObject = typeof value === "object" && value !== null && !Array.isArray(value);
    return isObject ? (value as Readonly<Record<string, unknown>>) : undefined;
  } catch {
    // Not JSON at all: the caller reports it, so nothing is swallowed.
    return undefined;
  }
}

function hasEscapes({ stdout, stderr }: GoldenOutput): boolean {
  return [...stdout, ...stderr].some((line) => line.includes("\u001b"));
}

function plain(line: string): string {
  return line.replaceAll(escapeCode, "");
}

function sameLines(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((line, index) => line === b[index]);
}
