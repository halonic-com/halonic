// A case's `expect`, checked against what its runs did. The rules are the
// old runner's: `context` is a partial match, `artifacts` means "at least
// these", `final` without `status` means the run finished, and a run that
// failed with nothing that allows it fails its test.

import type { RunSummary } from "@halonicjs/events";
import type { WorkflowTestCase } from "@halonicjs/format";
import { deepEqual, isPlainObject } from "@halonicjs/std";
import type { ExpectedStatus, TestFailure, TestRun } from "../test-result.ts";

type Expect = WorkflowTestCase["expect"];

/**
 * What `expect` finds wrong with the case's runs: its own run first in
 * `runs`, then its child runs. A step that would start a program cuts the
 * run short, so then only that step is reported: the rest of `expect` was
 * never reached.
 */
export function checkExpectations(expect: Expect, runs: readonly TestRun[]): TestFailure[] {
  const [own] = runs;
  if (own === undefined) return [];
  const program = runs.find((run) => run.summary.reason === "harness-unavailable");
  if (program !== undefined) {
    return [{ kind: "unscripted-program", step: program.summary.state ?? "" }];
  }
  return [
    ...outcomeFailures(expect, own.summary),
    ...contextFailures("", expect.context, own.summary.context, true),
    ...artifactFailures(expect.artifacts, own),
    ...unexpectedFailure(expect, own.summary),
  ];
}

/**
 * `final`, `states` and `status`, in the order the CLI says them. When the
 * steps or the status are wrong, the step the run ended in isn't reported
 * too: it would say the same thing twice, or claim an end that wasn't one.
 */
function outcomeFailures(expect: Expect, run: RunSummary): TestFailure[] {
  const failures: TestFailure[] = [];
  const expectedStatus = statusExpected(expect);
  const statesWrong = expect.states !== undefined && !deepEqual(expect.states, run.statesVisited);
  const statusWrong = expectedStatus !== undefined && expectedStatus !== run.status;
  const actualStep = run.state ?? "";
  if (expect.final !== undefined && !statesWrong && !statusWrong && expect.final !== actualStep) {
    failures.push({ kind: "final", expected: expect.final, actual: actualStep });
  }
  if (expect.states !== undefined && statesWrong) {
    failures.push({ kind: "states", expected: expect.states, actual: run.statesVisited });
  }
  if (expectedStatus !== undefined && statusWrong) {
    failures.push({
      kind: "status",
      expected: expectedStatus,
      actual: run.status,
      ...(run.status === "completed" || run.state === null ? {} : { step: run.state }),
    });
  }
  return failures;
}

/** The status `expect` asks for: its own, `completed` when only `final` is set, or none. */
function statusExpected(expect: Expect): ExpectedStatus | undefined {
  if (expect.status !== undefined) return expect.status;
  return expect.final === undefined ? undefined : "completed";
}

/**
 * One failure per expected field that doesn't match, by its dotted path.
 * Objects match key by key, so the run may set more; anything else, arrays
 * too, must be equal.
 */
function contextFailures(
  path: string,
  expected: unknown,
  actual: unknown,
  set: boolean,
): TestFailure[] {
  if (expected === undefined) return [];
  if (isPlainObject(expected) && isPlainObject(actual)) {
    return Object.entries(expected).flatMap(([key, value]) =>
      contextFailures(
        path === "" ? key : `${path}.${key}`,
        value,
        actual[key],
        Object.hasOwn(actual, key),
      ),
    );
  }
  if (!set) return [{ kind: "context", path, expected, set: false }];
  if (deepEqual(expected, actual)) return [];
  return [{ kind: "context", path, expected, set: true, actual }];
}

/** One failure per expected file the run didn't save, each with every file it did save. */
function artifactFailures(expected: readonly string[] | undefined, run: TestRun): TestFailure[] {
  if (expected === undefined) return [];
  const saved = [
    ...new Set(
      run.events.flatMap((event) => (event.type === "artifact.created" ? [event.name] : [])),
    ),
  ];
  return expected
    .filter((file) => !saved.includes(file))
    .map((file) => ({ kind: "artifacts", expected: file, saved }));
}

/** A run that failed when `expect` says nothing about its status fails with its error. */
function unexpectedFailure(expect: Expect, run: RunSummary): TestFailure[] {
  if (run.status !== "failed" || statusExpected(expect) !== undefined) return [];
  return [{ kind: "error", message: run.error ?? "The run failed." }];
}
