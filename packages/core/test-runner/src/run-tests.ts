// Runs a workspace's workflow tests, each case on an engine of its own.

import { type FoundTestCase, findTestCases } from "./list-tests.ts";
import { checkExpectations } from "./run/expectations.ts";
import { runCase } from "./run/run-case.ts";
import type { TestDeps, TestInput } from "./test-deps.ts";
import type { TestResult, TestSuiteResult } from "./test-result.ts";

/**
 * Runs the workspace's test cases that pass the filter, one after the
 * other, in file order and then case order. Each case gets fresh stores, a
 * test clock that starts at `deps.clock`'s time and moves only on its
 * `{ advance }` events, the model `deps.model` makes from its `mocks`,
 * connectors that answer from its `tools` and programs that answer from its
 * `programs`. Nothing real is reached, and no program is started.
 *
 * A failed test is a result, never an error: the result says why it failed.
 *
 * @example
 * const suite = await runWorkspaceTests({ workspace, textOf }, { clock, model, stores });
 * suite.failed; // 0
 * suite.tests[0].failures; // []
 */
export async function runWorkspaceTests(
  input: TestInput,
  deps: TestDeps,
): Promise<TestSuiteResult> {
  const started = deps.clock.now().getTime();
  const tests: TestResult[] = [];
  for (const found of await findTestCases(input)) {
    tests.push(await runTest(input, found, deps));
  }
  const passed = tests.filter((test) => test.passed).length;
  return {
    tests,
    passed,
    failed: tests.length - passed,
    durationMs: deps.clock.now().getTime() - started,
  };
}

/**
 * One case's result. Its failures come in the order the CLI says them:
 * the expectations, then what the case's script found, then why the runs
 * stopped early.
 */
async function runTest(
  input: TestInput,
  found: FoundTestCase,
  deps: TestDeps,
): Promise<TestResult> {
  const started = deps.clock.now().getTime();
  const { testCase, ...ref } = found;
  const ran = await runCase({ workspace: input.workspace, ...ref, testCase }, deps);
  const failures = [
    ...checkExpectations(testCase.expect, ran.runs, ran.unscriptedPrograms),
    ...ran.script,
    ...ran.stopped,
  ];
  return {
    ...ref,
    passed: failures.length === 0,
    durationMs: deps.clock.now().getTime() - started,
    failures,
    runId: ran.runId,
    runs: ran.runs,
  };
}
