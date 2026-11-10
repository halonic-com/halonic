import type { CantTryStep } from "@halonicjs/events";
import { isCantTryError } from "@halonicjs/ports";
import type { EffectFailedInput } from "../kernel/decide-types.ts";
import { providerTextOf } from "./provider-text-of.ts";
import { runFailureReasonOf } from "./run-failure-reason-of.ts";

/**
 * The input a call the run waits on gives when it throws: why it failed,
 * the provider's own text when there is one, and, for a `CantTryError`, the
 * step it couldn't try. The adapter knows the item being tried and why; the
 * step is the state the call ran in.
 *
 * @param call - the call's id, the time it failed and the state it ran in
 *
 * @example
 * return failedCallInput(error, { callId: "call-3", at: now, step: "draft" });
 */
export function failedCallInput(
  error: unknown,
  call: { callId: string; at: string; step: string },
): EffectFailedInput {
  const providerText = providerTextOf(error);
  const cantTry: CantTryStep | null = isCantTryError(error)
    ? { status: "cant-try", item: error.item, step: call.step, reason: error.reason }
    : null;
  return {
    type: "effect-failed",
    at: call.at,
    callId: call.callId,
    error: error instanceof Error ? error.message : String(error),
    ...runFailureReasonOf(error),
    ...(providerText === undefined ? {} : { providerText }),
    ...(cantTry === null ? {} : { cantTry }),
  };
}
