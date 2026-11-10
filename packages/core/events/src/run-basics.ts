/** Whether a run is a real run or part of a workflow test. */
export type RunKind = "run" | "test";

/** Where a run is: still going, waiting for an event or a timer, or ended. */
export type RunStatus = "running" | "waiting" | "completed" | "failed";

/**
 * Tokens one model call used, or the sum over a run. Providers with a prompt
 * cache charge the tokens read from it and written to it at their own rates,
 * so those are counted apart and are not in `inputTokens`.
 */
export interface Usage {
  /** Input tokens the cache didn't serve or store. */
  inputTokens: number;
  outputTokens: number;
  /** Input tokens read from the provider's prompt cache. Absent when there were none. */
  cacheReadTokens?: number;
  /** Input tokens written to the provider's prompt cache. Absent when there were none. */
  cacheWriteTokens?: number;
}

/** What started a run. Absent for runs started by hand from a workflow. */
export interface RunTrigger {
  type: "manual" | "schedule" | "every" | "mail" | "signal";
  /** Routine key: "<hubId>/<routineId>" or "@workspace/<routineId>". */
  routineId?: string;
  /** ISO time the run was due (the scheduled time, not when it actually started). */
  at: string;
  /** Mail triggers: the Gmail message that started this run (one run per message). */
  messageId?: string;
  /** Signal triggers: "<runId>:<seq>" of the signal that started this run (one run per signal). */
  signalId?: string;
}

/** The run and state that started a child run, and how deep it is (1 = child of a top-level run). */
export interface RunParent {
  runId: string;
  state: string;
  depth: number;
}

/**
 * How a tool call ended: it answered (`ok`), it failed (`error`), or it broke
 * off without an answer, so it may or may not have done its work (`unknown`).
 */
export type ToolOutcome = "ok" | "error" | "unknown";

/**
 * Why a run failed. Each reason has its own requirement in `requirements/`.
 *
 * - `budget`: a run or monthly budget stopped it.
 * - `cancelled`: someone cancelled it.
 * - `model-missing`: the model it asked for doesn't exist at its provider.
 * - `model-no-tools`: that model can't call tools and the step offered some.
 * - `error`: something else went wrong; the `error` text says what.
 * - `model-unreachable`: the model's host didn't answer; `run.failed` names it in `host`.
 * - `model-out-of-memory`: the machine running the model ran out of memory for it.
 * - `disk-full`: there was no disk space left to write what the run needed.
 * - `interrupted`: the engine stopped while the run was going, and found it on its next start.
 * - `sandbox-start-failed`: the sandbox check had passed, but the sandbox didn't start for this run.
 * - `harness-start-failed`: the harness program failed to start for this run, or didn't send its
 *   first event within its time limit (60 s by default).
 */
export type RunFailureReason =
  | "budget"
  | "cancelled"
  | "model-missing"
  | "model-no-tools"
  | "error"
  | "model-unreachable"
  | "model-out-of-memory"
  | "disk-full"
  | "interrupted"
  | "sandbox-start-failed"
  | "harness-start-failed";

/** Why a model was skipped before it was called: its provider's key isn't set. */
export type ModelSkipReason = "no-key";

/** Who resolved an approval: a person, or a rule that answers without asking anyone. */
export type ApprovalResolver = "person" | "rule";
