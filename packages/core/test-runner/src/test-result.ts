// What a test run gives back: one result per test case, with the runs it
// made and, when it failed, why, as data the CLI turns into sentences.

import type { CantTryStep, RunEvent, RunStatus, RunSummary } from "@halonicjs/events";

/**
 * The statuses a test can expect a run to end in. `cant-try` is not one: a
 * test can't ask for a run that didn't try every step (HAL-4477).
 */
export type ExpectedStatus = "completed" | "waiting" | "failed";

/**
 * One reason a test case failed. Each carries what the `halonic test` output
 * needs for its "Expected …, but …" sentence; step names are the ids in the
 * workflow, and the CLI writes them as the live lines do.
 */
export type TestFailure =
  /** `expect.final`: the step the run ended in. Not given when `states` failed too. */
  | { readonly kind: "final"; readonly expected: string; readonly actual: string }
  /** `expect.states`: the steps the run went through, in order. */
  | {
      readonly kind: "states";
      readonly expected: readonly string[];
      readonly actual: readonly string[];
    }
  /**
   * `expect.status`, or `completed` implied by `final`. `step` is where the
   * run waits, failed or couldn't try, absent when it finished or when the
   * whole item couldn't be tried.
   */
  | {
      readonly kind: "status";
      readonly expected: ExpectedStatus;
      readonly actual: RunStatus;
      readonly step?: string;
    }
  /**
   * `expect.context`: one per field that doesn't match, by its path as the
   * test file writes it (`ticket.status`). `actual` is absent when the run
   * didn't set the field.
   */
  | {
      readonly kind: "context";
      readonly path: string;
      readonly expected: unknown;
      readonly set: boolean;
      readonly actual?: unknown;
    }
  /** `expect.artifacts`: one per file the run didn't save, with every file it did save. */
  | { readonly kind: "artifacts"; readonly expected: string; readonly saved: readonly string[] }
  /** The run called a connector tool the case has no scripted result for. */
  | { readonly kind: "unscripted-tool"; readonly tool: string }
  /** A step would start a program, which tests never do. */
  | { readonly kind: "unscripted-program"; readonly step: string }
  /** Scripted model replies for an agent that the run never asked for. */
  | { readonly kind: "unused-replies"; readonly agent: string; readonly count: number }
  /** Scripted results for a tool that the run never called. */
  | { readonly kind: "unused-tool-results"; readonly tool: string; readonly count: number }
  /** An event of the case reached a run that wasn't waiting; later events weren't sent. */
  | {
      readonly kind: "event-not-delivered";
      readonly event: string;
      readonly status: RunStatus;
    }
  /**
   * The run stopped at steps it couldn't try, with no `status` expected
   * (requirement `events.run-cant-try`): every such step, as the run log has them.
   */
  | { readonly kind: "cant-try"; readonly steps: readonly CantTryStep[] }
  /** The run failed with no expectation that allows it, or the engine threw. */
  | { readonly kind: "error"; readonly message: string };

/** One run a test case made: its own run, then its child runs in the order they started. */
export interface TestRun {
  readonly id: string;
  readonly summary: RunSummary;
  readonly events: readonly RunEvent[];
}

/** The result of one test case. */
export interface TestResult {
  readonly hub: string;
  readonly workflow: string;
  /** The case's `name`. */
  readonly name: string;
  /** The test file, relative to the workspace. */
  readonly file: string;
  /** The line of the case's `name` in the test file, from 1; absent when the text isn't known. */
  readonly line?: number;
  readonly passed: boolean;
  readonly durationMs: number;
  /** Empty when the test passed. */
  readonly failures: readonly TestFailure[];
  /** The case's own run, or `null` when the engine didn't start one. */
  readonly runId: string | null;
  readonly runs: readonly TestRun[];
}

/** The result of every test case that ran, in file order and then case order. */
export interface TestSuiteResult {
  readonly tests: readonly TestResult[];
  readonly passed: number;
  readonly failed: number;
  readonly durationMs: number;
}
