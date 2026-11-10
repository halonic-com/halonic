import { counted, listInWords } from "./counts.ts";
import { defineMessages } from "./define.ts";
import { bold, dim, markPart, phrase } from "./phrase.ts";
import { suggestedCommand } from "./suggested-command.ts";

/**
 * The sentences of `halonic test [--dir <folder>] [--filter <name>]`
 * (cli-output 1.9 and 3.3). The marks in front of each test, the columns and
 * the indent of a failure are the printer's; these are the words.
 */
export const testMessages = defineMessages("test", {
  summary: () => phrase`Run a workspace's workflow tests with the test model`,
  /** The first line, saying what `test` does and doesn't do: the most common worry. */
  testing: (workspace: string) =>
    phrase`Testing ${workspace} with the test model. Nothing is sent anywhere.`,
  /** A test as the test file names it: "support-reply › answers a refund question". */
  name: (workflow: string, test: string) => phrase`${workflow} ${markPart("studioPath")} ${test}`,
  /** How long one test took, dimmed at the end of its line: "0.4 s". */
  took: (seconds: number) => [dim(inSeconds(seconds))],
  /** Where the failed test is, dimmed under its failure: "hubs/support/workflows/support-reply.test.yaml:31". */
  where: (file: string, line: number) => [dim(`${file}:${line}`)],

  /** A failure: expected and actual in plain words, with both steps in bold. */
  endedElsewhere: (expected: string, actual: string) =>
    phrase`Expected the run to end in the step ${bold(expected)}, but it ended in ${bold(actual)}.`,
  /** `states` failed: the steps the test expected, then the ones the run went through, in order. */
  wentElsewhere: (expected: readonly string[], actual: readonly string[]) =>
    phrase`Expected the run to go through ${listInWords(expected)}, but it went through ${listInWords(actual)}.`,
  /** `status` failed: "Expected the run to finish, but it failed in the step Draft reply." */
  endedOtherwise: (expected: TestStatus, actual: RunOutcome) =>
    phrase`Expected the run ${expectedStatusWords[expected]}, but ${outcomeInWords(actual)}.`,
  /** `context` failed for one field, named by its path as the test file writes it. Values as compact JSON. */
  otherValue: (path: string, expected: unknown, actual: unknown) =>
    phrase`Expected ${bold(path)} to be ${compactJson(expected)} when the run ended, but it was ${compactJson(actual)}.`,
  /** `context` failed because the run never set the field. */
  valueNotSet: (path: string, expected: unknown) =>
    phrase`Expected ${bold(path)} to be ${compactJson(expected)} when the run ended, but it wasn't set.`,
  /**
   * `artifacts` failed for one expected file. `saved` is every file the run
   * did save, so "saved no files" is only said when that is true.
   * `artifacts` means "at least these" (HAL-2690): a file the test doesn't
   * list is never a failure of its own.
   */
  fileNotSaved: (file: string, saved: readonly string[]) =>
    saved.length === 0
      ? phrase`Expected the run to save ${bold(file)}, but it saved no files.`
      : phrase`Expected the run to save ${bold(file)}, but it didn't. It saved ${listInWords(saved)}.`,
  /** A step that would start a program with no scripted result fails its test; the program never starts. */
  unscriptedProgram: (step: string) =>
    phrase`The step ${step} would start a program, and tests never start programs. Script its result in the test file.`,

  allPassed: (tests: number, seconds: number) =>
    phrase`${counted(tests, "test", "tests")} passed in ${inSeconds(seconds)}.`,
  /** The last line when a test failed: "2 passed, 1 failed. 3 tests in 0.9 s." */
  someFailed: (passed: number, failed: number, seconds: number) =>
    phrase`${passed} passed, ${bold(`${failed} failed`)}. ${counted(passed + failed, "test", "tests")} in ${inSeconds(seconds)}.`,

  /** With a ! and exit 0: a workspace without tests isn't a failure. */
  noTests: (workspace: string) => phrase`${workspace} has no workflow tests yet.`,
  noTestsFix: () => phrase`Add one next to a workflow as <workflow>.test.yaml.`,
  /** `--filter` matched no test: wrong usage, exit 2. */
  noMatch: (filter: string) => phrase`No tests match "${filter}".`,
  /** `dir` is the user's own `--dir`, repeated so the command works where they typed it. */
  noMatchFix: (dir?: string) =>
    phrase`Run ${suggestedCommand("test", dir, "--list")} to see them all.`,
});

/** The `status` a test file can expect. */
export type TestStatus = "completed" | "waiting" | "failed";

/** How a tested run ended, with the step it waits or failed in. */
export type RunOutcome =
  | { readonly status: "completed" }
  | { readonly status: "waiting" | "failed"; readonly step: string };

const expectedStatusWords: Record<TestStatus, string> = {
  completed: "to finish",
  waiting: "to wait for an answer",
  failed: "to fail",
};

/** The step tells the user where to look; why it failed stays in --verbose and --json. */
function outcomeInWords(outcome: RunOutcome): string {
  switch (outcome.status) {
    case "completed":
      return "it finished";
    case "waiting":
      return `it's waiting for an answer in the step ${outcome.step}`;
    case "failed":
      return `it failed in the step ${outcome.step}`;
  }
}

/**
 * A step id from the test file that isn't a step of the workflow, shown as
 * written, in quotes. Real steps are named as in the live lines (3.4).
 */
export function unknownStep(id: string): string {
  return `"${id}"`;
}

/** A context value as compact JSON: text in double quotes, numbers and true, false and null bare. */
function compactJson(value: unknown): string {
  return JSON.stringify(value) ?? "null";
}

/** A test's time as the design writes it, to a tenth of a second: "0.4 s". */
function inSeconds(seconds: number): string {
  return `${seconds.toFixed(1)} s`;
}
