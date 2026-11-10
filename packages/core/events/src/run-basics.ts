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
  /**
   * Input tokens written to the provider's prompt cache for its short
   * lifetime (Anthropic: 5 minutes). Absent when there were none.
   */
  cacheWriteTokens?: number;
  /**
   * Input tokens written to the provider's prompt cache for 1 hour, which
   * costs more than a short write. Absent when there were none.
   */
  cacheWrite1hTokens?: number;
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
  /**
   * Routine runs that started later than the tick's grace after `at`, such
   * as after the computer slept or Halonic was closed. Absent for a run that
   * started on time.
   */
  catchUp?: RunCatchUp;
}

/** How a routine run caught up: what its routine's catch-up rule dropped on the same tick. */
export interface RunCatchUp {
  /**
   * Earlier due times of the routine that the catch-up rule dropped on this
   * tick: the "run once" rule, the 100 cap and the 7-day window. Only the
   * first catch-up run of a tick counts them; later ones have 0. Times
   * skipped because the last run was still going don't count.
   */
  skipped: number;
  /** Set when counting stopped at its limit, so there were at least `skipped`. */
  countIsMinimum?: true;
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
 * Where a payload too large for the run log is kept: the hash of its bytes
 * in the run's blob store, their size and their media type. The same shape
 * as `BlobRef` in `@halonicjs/ports`, which this package may not import.
 */
export interface StoredBlob {
  /** Lowercase hex SHA-256 of the bytes. */
  hash: string;
  /** In bytes. */
  size: number;
  mediaType: string;
}

/**
 * What a tool can do, as its integration's sheet says: `read` changes
 * nothing, `write` changes data, `send` reaches people outside. The same
 * values as `ToolRisk` in `@halonicjs/ports`.
 */
export type ToolRisk = "read" | "write" | "send";

/**
 * What one call of a sending tool sends, in the singular and the plural, as
 * its integration's sheet names it, such as `{ one: "email", many: "emails" }`.
 * Both are stored so a reader never has to make a plural itself.
 */
export interface ToolNoun {
  one: string;
  many: string;
}

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
 * - `key-refused`: the model's provider didn't accept its key, or no key was stored for it.
 * - `out-of-credit`: the account at the model's provider has no credit left or reached its limit.
 *   This is never the Halonic budget, which is `budget`.
 * - `provider-busy`: the model's provider was overloaded or asked Halonic to slow down.
 * - `answer-not-an-option`: the agent's output is a `choice`, and its answer wasn't one of the
 *   options.
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
  | "harness-start-failed"
  | "key-refused"
  | "out-of-credit"
  | "provider-busy"
  | "answer-not-an-option";

/**
 * The model provider's own error text, kept in the run log for `--debug` and
 * Copy details only (requirement `events.provider-text`). Studio and the
 * command line never show it by default: microcopy 1.4 allows no quoted
 * outside text in a message. The provider shortened it and checked it for
 * keys before the engine logged it.
 */
export interface ProviderText {
  /** The HTTP status the text came with; left out for a stream error that has none. */
  status?: number;
  text: string;
}

/** Why a model was skipped before it was called: its provider's key isn't set. */
export type ModelSkipReason = "no-key";

/** Who resolved an approval: a person, or a rule that answers without asking anyone. */
export type ApprovalResolver = "person" | "rule";
