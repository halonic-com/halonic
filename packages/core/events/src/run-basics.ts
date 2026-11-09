/** Whether a run is a real run or part of a workflow test. */
export type RunKind = "run" | "test";

/** Where a run is: still going, waiting for an event or a timer, or ended. */
export type RunStatus = "running" | "waiting" | "completed" | "failed";

/** Tokens one model call used, or the sum over a run. */
export interface Usage {
  inputTokens: number;
  outputTokens: number;
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
 * Why a run failed: a budget stopped it, someone cancelled it, the model it
 * asked for doesn't exist at its provider (`model-missing`), that model can't
 * call tools and the step offered some (`model-no-tools`), or something else
 * went wrong (`error`).
 */
export type RunFailureReason =
  | "budget"
  | "cancelled"
  | "model-missing"
  | "model-no-tools"
  | "error";

/** Why a model was skipped before it was called: its provider's key isn't set. */
export type ModelSkipReason = "no-key";

/** Who resolved an approval: a person, or a rule that answers without asking anyone. */
export type ApprovalResolver = "person" | "rule";
