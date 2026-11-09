import type { RunFailureReason } from "@halonicjs/events";
import { isModelCallError, isRunFailureError, type ModelCallErrorReason } from "@halonicjs/ports";

/** Why a run failed, as `run.failed` records it: the reason, and the host for `model-unreachable`. */
export interface RunFailure {
  reason: RunFailureReason;
  host?: string;
}

/** The run failure reason of each model call failure. */
const reasonOfModelCall = {
  "no-key": "error",
  offline: "model-unreachable",
  "model-missing": "model-missing",
  "model-no-tools": "model-no-tools",
  "out-of-memory": "model-out-of-memory",
  refused: "error",
} as const satisfies Record<ModelCallErrorReason, RunFailureReason>;

/**
 * Why a run failed, from the error that stopped it. This is the one place the
 * engine turns an error into a run failure reason (requirement
 * `engine.run-failure-reason-of`):
 *
 * - a `ModelCallError` gives the reason of its model call failure, and the
 *   host for `offline`. `no-key` and `refused` are `error`: the message
 *   says which.
 * - a `RunFailureError` from an adapter gives its own failure;
 * - a Node error with the code `ENOSPC` is `disk-full`, so a store or sandbox
 *   that writes files needs no wrapping;
 * - an aborted call (an `AbortError`, as `fetch` throws when its signal
 *   aborts) is `cancelled`;
 * - anything else is `error`.
 *
 * Both errors are checked by name and fields, not `instanceof`, because an
 * adapter may have its own copy of `@halonicjs/ports`. `budget` and
 * `interrupted` never come from an error: the engine sets them where it stops
 * a run for its budget or finds a run it lost. Like `errorKindOf`, it reads
 * only the error itself, never its `cause`.
 */
export function runFailureReasonOf(error: unknown): RunFailure {
  if (isModelCallError(error)) {
    const reason = reasonOfModelCall[error.reason];
    return error.host === undefined ? { reason } : { reason, host: error.host };
  }
  if (isRunFailureError(error)) {
    return { reason: error.failure };
  }
  if (!(error instanceof Error)) {
    return { reason: "error" };
  }
  if ((error as { code?: unknown }).code === "ENOSPC") {
    return { reason: "disk-full" };
  }
  if (error.name === "AbortError") {
    return { reason: "cancelled" };
  }
  return { reason: "error" };
}
