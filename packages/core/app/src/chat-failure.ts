// Why a chat answer's model turn failed, in the words a run's `run.failed`
// uses, so a chat can say the same failure sentence a run page says
// (requirement `app.chat-failure-cause`). `chatFailureOf` in
// `chat-run-failure.ts` turns it into the facts those sentences name.

import type { RunFailureCause } from "@halonicjs/events";
import { isModelCallError, runFailureReasonOfModelCall } from "@halonicjs/ports";

/**
 * Why a model turn failed, as `run.failed` would name it: the reason, the
 * host that didn't answer for `model-unreachable` and `model-timeout`, and
 * the typed cause, such as `proxy.refused`, when the call had one.
 */
export interface ChatFailureCause {
  readonly reason: (typeof runFailureReasonOfModelCall)[keyof typeof runFailureReasonOfModelCall];
  readonly host?: string;
  readonly cause?: RunFailureCause;
}

/**
 * The cause of a failed model turn, read from a `ModelCallError` by name and
 * fields, as the engine reads it for a run. Any other error has no cause, so
 * the chat falls back to its own words.
 *
 * @example
 * chatFailureCauseOf(new ModelCallError("offline", "Ollama didn't answer.", { host: "localhost:11434" }));
 * // { reason: "model-unreachable", host: "localhost:11434" }
 */
export function chatFailureCauseOf(error: unknown): ChatFailureCause | undefined {
  if (!isModelCallError(error)) return undefined;
  const { host, kind, failureCause } = error;
  return {
    reason: runFailureReasonOfModelCall[error.reason],
    ...(host === undefined ? {} : { host }),
    ...(kind === undefined ? {} : { cause: { kind, ...failureCause } }),
  };
}
