// The first run's additions to a run that waits on a model or fails (first-run-flow 3.4, approved
// on HAL-7993): the waiting line escalates on a slow model, sooner for a key than for a model on
// this computer, and a failed run offers **Pick another model** beside **Run again**. A page shows
// them only when a guide gives it Pick another model (`WorkflowGuideRun`); every other run is as
// it always is. The escalations change the one line's sentence and its ways out, never add a
// second part (first-run-progress 2, HAL-13409).

import type { RunEvent, RunFailureReason } from "@halonicjs/events";
import type { ProviderKind } from "../api.ts";

/** What a guided run says when its model is slow or failed. */
export const guidedRunWords = {
  slowKey: "This is taking longer than usual. The model is still working.",
  /** A cold model on a laptop can need minutes for its first step, so the line says so (C672 #3). */
  slowLocal: "Loading the model. The first run can take a few minutes.",
  /** The same verb as the button it offers, so the line and the button read as one (C672 #3). */
  stillNoAnswer: "Still no answer. You can keep waiting, or pick another model. Nothing is lost.",
  pickAnotherModel: "Pick another model",
  tooSmall: (agent: string) =>
    `This model may be too small for the ${agent}. Try a larger one, or use Sample answers.`,
};

/** When a model call counts as slow and the line says so. */
export const slowModelAfterMs = 20_000;

/** When the line offers another model, for a key: a cloud model this slow isn't answering. */
export const keyNoAnswerAfterMs = 60_000;

/**
 * When the line offers another model, for a model on this computer: a cold model on a laptop can
 * need more than a minute for its first step, and the run is working (a target, to be tuned).
 */
export const localNoAnswerAfterMs = 180_000;

/** The model a run called last: its agent and provider. */
export interface ModelCall {
  readonly agent: string;
  readonly provider: string;
  /** Whether the model runs on this computer, such as Ollama's. */
  readonly local: boolean;
}

/**
 * The run's last model call, or `undefined` when it made none. A provider counts as local by its
 * kind in the workspace, and Ollama always does, as the waiting line names it.
 */
export function lastModelCall(
  log: readonly RunEvent[],
  providerKind?: (providerId: string) => ProviderKind | undefined,
): ModelCall | undefined {
  const call = log.findLast((event) => event.type === "llm.request");
  if (call?.type !== "llm.request") return undefined;
  const local = call.provider === "ollama" || providerKind?.(call.provider) === "local";
  return { agent: call.agent, provider: call.provider, local };
}

/** What the waiting line on a model says after `waitedMs`, and whether it offers another model. */
export interface ModelEscalation {
  /** The line's second sentence; `undefined` keeps the line's own reason. */
  readonly reason: string | undefined;
  readonly offersAnotherModel: boolean;
}

/**
 * The escalation of a guided run's waiting line on a model: with a key, "taking longer" at 20
 * seconds and the way out at 60; on this computer, "Loading the model" at 20 seconds and the way
 * out only at about 3 minutes.
 */
export function modelEscalation(local: boolean, waitedMs: number): ModelEscalation {
  const noAnswerAfter = local ? localNoAnswerAfterMs : keyNoAnswerAfterMs;
  if (waitedMs >= noAnswerAfter) {
    return { reason: guidedRunWords.stillNoAnswer, offersAnotherModel: true };
  }
  if (waitedMs >= slowModelAfterMs) {
    return {
      reason: local ? guidedRunWords.slowLocal : guidedRunWords.slowKey,
      offersAnotherModel: false,
    };
  }
  return { reason: undefined, offersAnotherModel: false };
}

/**
 * The failures where a model on this computer answered badly or fell silent once it had begun,
 * which a larger model may not: not a model that wasn't there, didn't start or ran out of memory.
 */
const tooSmallReasons: ReadonlySet<RunFailureReason> = new Set([
  "answer-not-an-option",
  "model-no-tools",
  "model-timeout",
  "error",
]);

/**
 * The agent a failed run's model may be too small for: the agent of its last model call, when
 * that model runs on this computer and the run failed in a way a larger model may not.
 */
export function tooSmallAgent(
  reason: RunFailureReason | undefined,
  call: ModelCall | undefined,
): string | undefined {
  if (reason === undefined || call === undefined || !call.local) return undefined;
  return tooSmallReasons.has(reason) ? call.agent : undefined;
}
