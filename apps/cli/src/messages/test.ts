import { counted } from "./counts.ts";
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

/** A test's time as the design writes it, to a tenth of a second: "0.4 s". */
function inSeconds(seconds: number): string {
  return `${seconds.toFixed(1)} s`;
}
