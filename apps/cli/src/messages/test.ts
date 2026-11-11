import type { RunStatus } from "@halonicjs/events";
import { counted, listInWords } from "./counts.ts";
import { defineMessages } from "./define.ts";
import { bold, dim, markPart, type Phrase, phrase } from "./phrase.ts";
import { suggestedCommand } from "./suggested-command.ts";

/**
 * The sentences of `halonic test [--dir <folder>] [--filter <name>]`
 * (cli-output 1.9 and 3.3). The marks in front of each test, the columns and
 * the indent of a failure are the printer's; these are the words.
 */
export const testMessages = defineMessages("test", {
  summary: () => phrase`Run a workspace's workflow tests with the test model`,
  /** What `test` was doing, for "✕ Couldn't test ./downloads: …". */
  action: (folder: string) => phrase`test ${folder}`,
  /** The help line of `--filter`, as the CLI reference words the option. */
  filterOption: () => phrase`Run only the tests whose hub/workflow/name contains this text.`,
  /** The help line of `--list`. */
  listOption: () => phrase`List the tests without running them.`,
  /** The first line, saying what `test` does and doesn't do: the most common worry. */
  testing: (workspace: string) =>
    phrase`Testing ${workspace} with the test model. Nothing is sent anywhere.`,
  /** The last line of `--list`: "3 tests in acme." */
  listed: (tests: number, workspace: string) =>
    phrase`${counted(tests, "test", "tests")} in ${workspace}.`,
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
  /** `status` failed: "Expected the run to finish, but it failed in the step Draft reply.", the step in bold. */
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

  /**
   * The run called a connector tool the case has no scripted result for;
   * the tool as the test file's `tools` key names it: "files.read_file".
   */
  unscriptedTool: (tool: string) =>
    phrase`The run called the tool ${bold(tool)}, and the test has no result for it. Script its result in the test file.`,
  /** Scripted model replies the run never asked for. */
  unusedReplies: (agent: string, count: number) =>
    phrase`The test scripted ${counted(count, "reply", "replies")} for the agent ${bold(agent)} that the run never asked for.`,
  /** Scripted tool results the run never used. */
  unusedToolResults: (tool: string, count: number) =>
    phrase`The test scripted ${counted(count, "result", "results")} for the tool ${bold(tool)} that the run never used.`,
  /** An event of the test the run didn't take; the events after it weren't sent. */
  eventNotTaken: (event: string, status: RunStatus) =>
    phrase`The run didn't take the event ${bold(event)}, because ${notTakenWords[status]}.`,
  /** The run stopped at steps it couldn't try, with no `status` that allows it; none named when the whole workflow couldn't be tried. */
  cantTry: (steps: readonly string[]) =>
    steps.length === 0
      ? phrase`The run couldn't try this workflow: it needs changes you haven't accepted yet.`
      : phrase`The run couldn't try ${listInWords(steps)}: they need changes you haven't accepted yet.`,
  /** The run failed with no expectation that allows it, or the engine stopped it: its own error, as the run log has it. */
  runError: (error: string) => phrase`The run failed: ${error}`,

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

/**
 * How a tested run ended, with the step it waits, failed or couldn't try
 * in when there is one.
 */
export type RunOutcome =
  | { readonly status: "completed" | "running" }
  | { readonly status: "waiting" | "failed" | "cant-try"; readonly step?: string };

const expectedStatusWords: Record<TestStatus, string> = {
  completed: "to finish",
  waiting: "to wait for an answer",
  failed: "to fail",
};

/**
 * The step, in bold as in {@link testMessages.endedElsewhere}, tells the user
 * where to look; why it failed stays in --verbose and --json.
 */
function outcomeInWords(outcome: RunOutcome): Phrase {
  switch (outcome.status) {
    case "completed":
      return phrase`it finished`;
    case "running":
      return phrase`it was still running`;
    case "waiting":
      return outcome.step === undefined
        ? phrase`it's waiting for an answer`
        : phrase`it's waiting for an answer in the step ${bold(outcome.step)}`;
    case "failed":
      return outcome.step === undefined
        ? phrase`it failed`
        : phrase`it failed in the step ${bold(outcome.step)}`;
    case "cant-try":
      return outcome.step === undefined
        ? phrase`it couldn't try everything`
        : phrase`it couldn't try the step ${bold(outcome.step)}`;
  }
}

/** Why the run didn't take an event, by the status it was in. */
const notTakenWords: Record<RunStatus, string> = {
  completed: "it had finished",
  failed: "it had failed",
  waiting: "it waits for another event",
  running: "it was still running",
  "cant-try": "it couldn't try everything",
};

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
