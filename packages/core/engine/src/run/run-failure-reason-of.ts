import type { RunFailureReason } from "@halonicjs/events";
import { isModelCallError, isRunFailureError, type ModelCallErrorReason } from "@halonicjs/ports";
import { SandboxNotReadyError } from "./sandbox-not-ready-error.ts";

/**
 * Why a run failed, as `run.failed` records it: the reason, the host for
 * `model-unreachable`, and the sandbox's reason code for `sandbox-not-ready`.
 */
export interface RunFailure {
  reason: RunFailureReason;
  host?: string;
  sandboxReason?: string;
}

/**
 * The run failure reason of each model call failure. No key stored is part of
 * `key-refused` (microcopy 15.3): either way, the person fixes the key.
 */
const reasonOfModelCall = {
  "no-key": "key-refused",
  offline: "model-unreachable",
  "model-missing": "model-missing",
  "model-no-tools": "model-no-tools",
  "out-of-memory": "model-out-of-memory",
  "key-refused": "key-refused",
  "out-of-credit": "out-of-credit",
  "provider-busy": "provider-busy",
  refused: "error",
  "local-only": "local-only",
} as const satisfies Record<ModelCallErrorReason, RunFailureReason>;

/**
 * Why a run failed, from the error that stopped it. This is the one place the
 * engine turns an error into a run failure reason (requirement
 * `engine.run-failure-reason-of`):
 *
 * - a `ModelCallError` gives the reason of its model call failure, and the
 *   host for `offline`. `no-key` is `key-refused`, and `refused` is
 *   `error`: the message says what went wrong.
 * - a `RunFailureError` from an adapter gives its own failure;
 * - the engine's own `SandboxNotReadyError` is `sandbox-not-ready`, with
 *   the check's reason code;
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
  if (error instanceof SandboxNotReadyError) {
    return { reason: "sandbox-not-ready", sandboxReason: error.sandboxReason };
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
