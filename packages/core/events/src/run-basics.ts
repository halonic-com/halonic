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
