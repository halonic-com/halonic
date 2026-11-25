// The only makers of what the meter counts (requirement `engine.meter-port`):
// a model call from its logged `llm.response`, a run's end from its state and
// a step's times from the engine's clock. Nothing a step or a container says
// about its own use reaches the meter.

import { modelCallCharge, type RunEvent } from "@halonicjs/events";
import type { Clock } from "@halonicjs/ports";
import { hasEnded, type RunState } from "../kernel/run-state.ts";
import type { ModelCallUsage, RunEndUsage, StepTimes } from "./meter.ts";

/** A model call's response as the run log has it. */
export type LoggedModelResponse = Extract<RunEvent, { type: "llm.response" }>;

/**
 * What a logged model call counts for, by the rule a run's summary adds calls
 * up with (`events.summary-cost`): a call a subscription paid, an unpriced one
 * and a cached one cost 0, and a cached one has no tokens. Its `callId` is
 * the response's place in the run log (requirement `engine.meter-call-id`),
 * so it never changes for that call. Its `model` is the one that answered,
 * which a fallback may have picked over the one asked for.
 */
export function modelCallUsageOf(response: LoggedModelResponse): ModelCallUsage {
  const charge = modelCallCharge(response);
  const usage = {
    kind: "model_call",
    runId: response.runId,
    callId: `${response.runId}:${response.seq}`,
    model: `${response.provider}/${response.model}`,
    ...charge,
  };
  // The cast adds the mark only this package may add.
  return usage as ModelCallUsage;
}

/**
 * The end of a run.
 *
 * @throws RangeError when the run hasn't ended
 */
export function runEndUsageOf(run: RunState): RunEndUsage {
  if (!hasEnded(run.status)) {
    throw new RangeError(`Run "${run.runId}" hasn't ended, so its end can't be counted.`);
  }
  const usage = { kind: "run", runId: run.runId, status: run.status };
  return usage as RunEndUsage;
}

/**
 * A harness step's times, up to now by `clock`.
 *
 * @param startedAt - when the step started, by the same clock
 * @param harnessStartedAt - when its program started, or `null` when it never did
 */
export function stepTimesOf(
  clock: Clock,
  startedAt: Date,
  harnessStartedAt: Date | null,
): StepTimes {
  const now = clock.now().getTime();
  const times = {
    wallMs: Math.max(0, now - startedAt.getTime()),
    harnessMs: harnessStartedAt === null ? 0 : Math.max(0, now - harnessStartedAt.getTime()),
  };
  return times as StepTimes;
}
