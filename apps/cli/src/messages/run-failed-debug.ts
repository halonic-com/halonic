// What `--debug` prints under a failed run's two lines (`run-failures.ts`).

import type { ModelSkipReason } from "@halonicjs/events";
import { timesInWords } from "./counts.ts";
import { defineMessages } from "./define.ts";
import { phrase } from "./phrase.ts";

/**
 * What `--debug` prints under a failed run's lines, from its run log
 * (HAL-6613, decided with Sofia): the engine's own error, the provider's
 * own text, and the model calls of the step it failed in. These are for an
 * engineer, so they quote the log as it is.
 */
export const runFailedDebugMessages = defineMessages("runFailedDebug", {
  /** The `error` of `run.failed`. */
  engineSaid: (text: string) => phrase`The engine said: ${text}`,
  /** The `providerText` of `run.failed` or `llm.fallback`, with its HTTP status when it has one. */
  providerSaid: (text: string, status?: number) =>
    status === undefined
      ? phrase`The provider said: ${text}`
      : phrase`The provider said (HTTP ${String(status)}): ${text}`,
  /** Above the model calls, one per line under it. */
  modelCalls: () => phrase`Model calls in this step:`,
  noModelCalls: () => phrase`No model calls in this step.`,
  /** An `llm.request`, with how many times in a row the same call was made. */
  called: (agent: string, model: string, provider: string, times: number) =>
    times === 1
      ? phrase`${agent} called ${model} at ${provider}`
      : phrase`${agent} called ${model} at ${provider} ${timesInWords(times)}`,
  /** An `llm.fallback`. */
  movedOn: (agent: string, from: string, to: string, error: string) =>
    phrase`${agent} moved from ${from} to ${to}: ${error}`,
  /** An `llm.skipped`, with the alias tried next when there was one. */
  skipped: (agent: string, alias: string, reason: ModelSkipReason, next?: string) => {
    const why = reason === "no-key" ? "its key isn't set" : "the workspace is local only";
    return next === undefined
      ? phrase`${agent} skipped ${alias}: ${why}`
      : phrase`${agent} skipped ${alias}: ${why}, then tried ${next}`;
  },
});
