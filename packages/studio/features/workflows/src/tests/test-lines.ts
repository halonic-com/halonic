import type { WorkflowTestCase, WorkflowTests } from "../api.ts";
import { testsWords as words } from "./tests-words.ts";

/** How a row stands: passed, failed, not run yet, or (while the tests run) still to come. */
export type TestRowState = "passed" | "failed" | "not-run" | "waiting";

/** One test as its row shows it. */
export interface TestRow {
  readonly name: string;
  readonly state: TestRowState;
  readonly glyph: string;
  /** Why it failed, for a failed row. */
  readonly failure?: string | undefined;
}

const glyphs: Record<TestRowState, string> = {
  passed: "✓",
  failed: "✕",
  "not-run": "·",
  waiting: "·",
};

/** The state of one case: passed, failed, or `waiting` for a result that hasn't come in. */
function stateOf(passed: boolean | undefined): TestRowState {
  if (passed === undefined) return "not-run";
  return passed ? "passed" : "failed";
}

/**
 * The rows of the page. While the tests run, `done` holds the result of each case that has come in
 * by place in the list; the others show a still dot, whatever they did last time.
 */
export function testRows(
  cases: readonly WorkflowTestCase[],
  done?: ReadonlyMap<number, boolean>,
): TestRow[] {
  return cases.map((one, at) => {
    if (done !== undefined) {
      const passed = done.get(at);
      const state = passed === undefined ? "waiting" : stateOf(passed);
      return { name: one.name, state, glyph: glyphs[state] };
    }
    const state = stateOf(one.result?.passed);
    return { name: one.name, state, glyph: glyphs[state], failure: one.result?.failure };
  });
}

/** 24-hour `HH:MM` of an ISO time in the person's time zone, whatever the locale. */
export function clockTime(iso: string): string {
  const at = new Date(iso);
  return `${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")}`;
}

/**
 * The line over the list: "3 tests, not run yet", "2 of 3 pass · 10:42", and while the tests run
 * "1 of 3 done", with no time and not the last result (flow-workflows 6.1).
 */
export function testSummary(tests: WorkflowTests, running?: { readonly done: number }): string {
  const count = tests.cases.length;
  if (running !== undefined) return words.progress(running.done, count);
  const ran = tests.cases.filter((one) => one.result !== undefined);
  if (ran.length === 0) return words.notRunYet(count);
  const passed = ran.filter((one) => one.result?.passed).length;
  const time = tests.ranAt === undefined ? "" : ` · ${clockTime(tests.ranAt)}`;
  return words.passCount(passed, count, time);
}

/** Where two paths first differ, and the sentence that says it. */
export interface PathSplit {
  /** The 0-based place of the first difference. */
  readonly at: number;
  readonly sentence: string;
}

/**
 * Compares the expected path with the one the run took. `undefined` when they are the same. The
 * step number in the sentence counts from 1 (`workflows.tests.page`).
 */
export function pathSplit(
  expected: readonly string[],
  actual: readonly string[],
): PathSplit | undefined {
  const length = Math.max(expected.length, actual.length);
  for (let at = 0; at < length; at += 1) {
    const wanted = expected[at];
    const went = actual[at];
    if (wanted === went) continue;
    const step = at + 1;
    if (went === undefined) {
      return { at, sentence: `It stopped at step ${step}, before "${wanted}".` };
    }
    if (wanted === undefined) {
      return { at, sentence: `It kept going after the expected end, at step ${step}: "${went}".` };
    }
    return {
      at,
      sentence: `It went another way at step ${step}: "${went}" instead of "${wanted}".`,
    };
  }
  return undefined;
}
