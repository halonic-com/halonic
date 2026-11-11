import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { OldTestRun, RunLogs } from "../recording.ts";
import { deepEqual } from "./compare.ts";

/** A run log event as both sides are compared: a plain JSON object. */
export type LogEvent = Readonly<Record<string, unknown>>;

/** One run of a test as both sides are compared. */
export interface ComparedRun {
  readonly summary: Readonly<Record<string, unknown>>;
  readonly events: readonly LogEvent[];
}

/**
 * One workflow test as both sides are compared. Failures are compared by
 * their number only: the old runner gave sentences, the new one gives data
 * the CLI turns into sentences, and the CLI's own compare checks those.
 */
export interface ComparedTest {
  readonly passed: boolean;
  readonly failures: number;
  readonly runs: readonly ComparedRun[];
}

/**
 * One workflow test the new runner ran, in the shape the test runner's
 * result has: its runs in the order they started, the test's own first.
 */
export interface NewTestRun {
  readonly hub: string;
  readonly workflow: string;
  readonly name: string;
  readonly passed: boolean;
  readonly failures: readonly unknown[];
  readonly runs: readonly { readonly summary: unknown; readonly events: readonly unknown[] }[];
}

/** One workflow test of a fixture: its old and its new run logs, before any rule. */
export interface RunLogComparison {
  /** `<hub>/<workflow>/<name>`, the way a known gap names the test. */
  readonly test: string;
  readonly old: ComparedTest;
  readonly new: ComparedTest;
}

/** The name a known gap gives a test: `<hub>/<workflow>/<name>`. */
export function testName(test: Pick<NewTestRun, "hub" | "workflow" | "name">): string {
  return `${test.hub}/${test.workflow}/${test.name}`;
}

function comparedTest(test: OldTestRun | NewTestRun): ComparedTest {
  return {
    passed: test.passed,
    failures: test.failures.length,
    runs: test.runs.map((run) => ({
      summary: run.summary as Record<string, unknown>,
      events: run.events as LogEvent[],
    })),
  };
}

/**
 * Pairs each golden test with the new runner's test of the same name. A test
 * only one side ran is paired with no runs, failed, on the other side, so it
 * always differs.
 */
export function pairRunLogs(golden: RunLogs, fresh: readonly NewTestRun[]): RunLogComparison[] {
  const missing: ComparedTest = { passed: false, failures: 0, runs: [] };
  const olds = new Map(golden.tests.map((test) => [testName(test), comparedTest(test)]));
  const news = new Map(fresh.map((test) => [testName(test), comparedTest(test)]));
  return [...new Set([...olds.keys(), ...news.keys()])].map((test) => ({
    test,
    old: olds.get(test) ?? missing,
    new: news.get(test) ?? missing,
  }));
}

/** Whether two tests are exactly the same: pass or fail, the number of failures, every summary and event in order. */
export function sameTest(a: ComparedTest, b: ComparedTest): boolean {
  return deepEqual(a, b);
}

/** Reads a fixture's golden run logs, `run-logs.json` in its folder (only the base has them). */
export function readRunLogs(folder: string): RunLogs {
  return JSON.parse(readFileSync(join(folder, "run-logs.json"), "utf8")) as RunLogs;
}
