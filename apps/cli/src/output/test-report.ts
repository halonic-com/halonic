// Turns what the test runner returned into the lines `halonic test` prints
// (cli-output 3.3) and its `--json` fields (CLI reference): one line per
// test, the sentences of a failed one under it, then the summary. Every word
// comes from the catalogue or from the workspace; this file only decides the
// order, the columns and which sentence a failure gets.

import { sep } from "node:path";
import { hubWorkflows, workflowIn } from "@halonicjs/app";
import type { TestCaseRef, TestFailure, TestResult, TestSuiteResult } from "@halonicjs/test-runner";
import type { LoadedWorkspace } from "@halonicjs/workspace";
import { columns } from "../messages/columns.ts";
import type { Message } from "../messages/define.ts";
import { markPart, type Phrase, phrase, plainText } from "../messages/phrase.ts";
import { stepName } from "../messages/step-name.ts";
import { type RunOutcome, testMessages, unknownStep } from "../messages/test.ts";
import { printable } from "./printable.ts";

/** How the lines are shown. */
export interface TestView {
  /** The workspace as the lines name it: "Testing acme with the test model." */
  readonly workspace: string;
  /** The loaded workspace, to name each step as the live lines do. */
  readonly loaded: LoadedWorkspace;
}

/**
 * The lines of `halonic test`: what it does, a ✓ or ✕ line per test with its
 * time, the sentences of each failed test and where it is, then the summary.
 *
 * @example
 * testLines(result, { workspace: "acme", loaded });
 * // ["Testing acme with the test model. Nothing is sent anywhere.", "",
 * //  "✓ support-reply › answers a refund question   0.4 s",
 * //  "", "✓ 1 test passed in 0.4 s."] (as phrases)
 */
export function testLines(result: TestSuiteResult, view: TestView): Phrase[] {
  const rows = columns(
    result.tests.map((test) => [
      phrase`${markPart(test.passed ? "done" : "failed")} ${testName(test)}`,
      testMessages.took(test.durationMs / 1000).phrase,
    ]),
  );
  const lines: Phrase[] = [testMessages.testing(view.workspace).phrase, []];
  result.tests.forEach((test, index) => {
    lines.push(rows[index] ?? []);
    if (test.passed) return;
    const where = testMessages.where(shownFile(test.file), lineOf(test)).phrase;
    for (const sentence of failureSentences(test, view.loaded)) {
      lines.push(phrase`    ${sentence.phrase}`);
    }
    lines.push(phrase`    ${where}`, []);
  });
  if (lines.at(-1)?.length !== 0) lines.push([]);
  lines.push(summaryLine(result));
  return lines;
}

/** The lines of `halonic test --list`: each test with where it is, then how many. */
export function listLines(tests: readonly TestCaseRef[], workspace: string): Phrase[] {
  return [
    ...columns(
      tests.map((test) => [
        testName(test),
        testMessages.where(shownFile(test.file), lineOf(test)).phrase,
      ]),
    ),
    [],
    testMessages.listed(tests.length, workspace).phrase,
  ];
}

/** The lines when the workspace has no tests at all: a ! and the fix, exit 0. */
export function noTestsLines(workspace: string): Phrase[] {
  return [
    phrase`${markPart("needsYou")} ${testMessages.noTests(workspace).phrase}`,
    phrase`  ${testMessages.noTestsFix().phrase}`,
  ];
}

/** `--json`: the fields the CLI reference lists, each failure as its sentence with where it is. */
export function testJson(result: TestSuiteResult, loaded: LoadedWorkspace) {
  return {
    passed: result.passed,
    failed: result.failed,
    cases: result.tests.map((test) => ({
      hub: test.hub,
      workflow: test.workflow,
      name: test.name,
      status: test.passed ? "passed" : "failed",
      durationMs: test.durationMs,
      failures: failureSentences(test, loaded).map((sentence) => ({
        message: plainText(sentence.phrase),
        file: test.file,
        line: lineOf(test),
      })),
    })),
  };
}

/** `--list --json`: each case's hub, workflow and name only. */
export function listJson(tests: readonly TestCaseRef[]) {
  return { cases: tests.map(({ hub, workflow, name }) => ({ hub, workflow, name })) };
}

/** The summary line: ✓ when every test passed, else ✕ with both counts. */
function summaryLine(result: TestSuiteResult): Phrase {
  const seconds = result.durationMs / 1000;
  if (result.failed === 0) {
    return phrase`${markPart("done")} ${testMessages.allPassed(result.passed, seconds).phrase}`;
  }
  const failed = testMessages.someFailed(result.passed, result.failed, seconds);
  return phrase`${markPart("failed")} ${failed.phrase}`;
}

/** The sentence of each failure, in the runner's order, which is the design's. */
function failureSentences(test: TestResult, loaded: LoadedWorkspace): Message[] {
  const steps = stepsOf(loaded, test.hub, test.workflow);
  return test.failures.map((failure) => failureSentence(failure, steps));
}

function failureSentence(failure: TestFailure, steps: WorkflowSteps): Message {
  const step = steps.name;
  switch (failure.kind) {
    case "final":
      return steps.has(failure.expected)
        ? testMessages.endedElsewhere(step(failure.expected), step(failure.actual))
        : testMessages.endedInNoSuchStep(
            quotedId(failure.expected),
            quotedId(failure.actual),
            steps.ids.map(quotedId),
          );
    case "states":
      return statesSentence(failure.expected, failure.actual, steps);
    case "status":
      return testMessages.endedOtherwise(failure.expected, outcomeOf(failure, step));
    case "context":
      return failure.set
        ? testMessages.otherValue(printable(failure.path), failure.expected, failure.actual)
        : testMessages.valueNotSet(printable(failure.path), failure.expected);
    case "artifacts":
      return testMessages.fileNotSaved(printable(failure.expected), failure.saved.map(printable));
    case "unscripted-tool":
      return testMessages.unscriptedTool(printable(failure.tool));
    case "unscripted-program":
      return testMessages.unscriptedProgram(step(failure.step));
    case "unused-replies":
      return testMessages.unusedReplies(printable(failure.agent), failure.count);
    case "unused-tool-results":
      return testMessages.unusedToolResults(printable(failure.tool), failure.count);
    case "unused-program-results":
      return testMessages.unusedProgramResults(printable(failure.agent), failure.count);
    case "event-not-delivered":
      return testMessages.eventNotTaken(printable(failure.event), failure.status);
    case "cant-try":
      return testMessages.cantTry(
        failure.steps.flatMap((each) => (each.step === null ? [] : [step(each.step)])),
      );
    case "error":
      return testMessages.runError(printable(failure.message));
  }
}

/** How the run ended, with its step by name and, for a failed run, its error as printable text. */
function outcomeOf(
  failure: Extract<TestFailure, { kind: "status" }>,
  step: (stateId: string) => string,
): RunOutcome {
  const where = failure.step === undefined ? {} : { step: step(failure.step) };
  if (failure.actual === "failed") {
    return {
      status: "failed",
      ...where,
      ...(failure.error === undefined ? {} : { error: printable(failure.error) }),
    };
  }
  return failure.actual === "completed" || failure.actual === "running"
    ? { status: failure.actual }
    : { status: failure.actual, ...where };
}

/** The steps of the test's workflow, to name them in a failure. */
interface WorkflowSteps {
  /** Every step id, in the workflow file's order. */
  readonly ids: readonly string[];
  /** Whether the workflow has a step with this id. */
  readonly has: (stateId: string) => boolean;
  /**
   * The step as the live lines name it (cli-output 3.4); an id that isn't
   * one of its steps is shown as written, in quotes.
   */
  readonly name: (stateId: string) => string;
}

function stepsOf(loaded: LoadedWorkspace, hub: string, workflow: string): WorkflowSteps {
  const states = workflowIn(hubWorkflows(loaded), hub, workflow)?.states ?? {};
  const has = (stateId: string) => Object.hasOwn(states, stateId);
  return {
    ids: Object.keys(states),
    has,
    name: (stateId) => {
      const state = has(stateId) ? states[stateId] : undefined;
      return state === undefined ? quotedId(stateId) : stepName(stateId, state.description);
    },
  };
}

/**
 * `states` failed: each step by its name, or, when the test names a step the
 * workflow doesn't have, every step by its id and the ids it does have.
 */
function statesSentence(
  expected: readonly string[],
  actual: readonly string[],
  steps: WorkflowSteps,
): Message {
  const unknown = [...new Set(expected.filter((stateId) => !steps.has(stateId)))];
  if (unknown.length === 0) {
    return testMessages.wentElsewhere(expected.map(steps.name), actual.map(steps.name));
  }
  return testMessages.wentThroughNoSuchStep(
    expected.map(quotedId),
    actual.map(quotedId),
    unknown.map(quotedId),
    steps.ids.map(quotedId),
  );
}

/** A step id as a test file writes it, in quotes: `"replied"`. */
function quotedId(stateId: string): string {
  return printable(unknownStep(stateId));
}

/** "support-reply › answers a refund question", both from the test file. */
function testName(test: TestCaseRef): Phrase {
  return testMessages.name(printable(test.workflow), printable(test.name)).phrase;
}

/**
 * The line of the case's `name`. The runner has it whenever it could read
 * the test file, which it loaded from; line 1 stands in otherwise, since
 * `--json` always gives a line.
 */
function lineOf(test: TestCaseRef): number {
  return test.line ?? 1;
}

/** A workspace path, which always has `/`, with the system's separator, as the user would type it. */
function shownFile(file: string): string {
  return printable(file.split("/").join(sep));
}
