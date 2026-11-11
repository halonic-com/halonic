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
import { testMessages, unknownStep } from "../messages/test.ts";
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
  const step = stepNamer(loaded, test.hub, test.workflow);
  return test.failures.map((failure) => failureSentence(failure, step));
}

function failureSentence(failure: TestFailure, step: (id: string) => string): Message {
  switch (failure.kind) {
    case "final":
      return testMessages.endedElsewhere(step(failure.expected), step(failure.actual));
    case "states":
      return testMessages.wentElsewhere(failure.expected.map(step), failure.actual.map(step));
    case "status":
      return testMessages.endedOtherwise(
        failure.expected,
        failure.step === undefined
          ? { status: failure.actual }
          : { status: failure.actual, step: step(failure.step) },
      );
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

/**
 * Names a step of the test's workflow as the live lines do (cli-output 3.4);
 * an id that isn't one of its steps is shown as written, in quotes.
 */
function stepNamer(
  loaded: LoadedWorkspace,
  hub: string,
  workflow: string,
): (stateId: string) => string {
  const states = workflowIn(hubWorkflows(loaded), hub, workflow)?.states ?? {};
  return (stateId) => {
    const state = Object.hasOwn(states, stateId) ? states[stateId] : undefined;
    return state === undefined
      ? printable(unknownStep(stateId))
      : stepName(stateId, state.description);
  };
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
