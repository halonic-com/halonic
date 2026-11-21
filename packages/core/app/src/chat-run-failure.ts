// A failed chat answer's facts, as a failed run's: the Try it chat words
// them with the run page's failure sentences (requirement
// `app.chat-failure-cause`).

import type { ChatFailureCause } from "./chat-failure.ts";
import type { FailedModel } from "./failed-model.ts";
import { type RunFailure, runFailureOf } from "./run-failure-facts.ts";

/**
 * The facts of a failed chat answer, as {@link runFailureOf} gives them for a
 * run, so the chat words them with the runs' failure sentences.
 *
 * @param message - the error's message, for a failure without facts of its own
 * @param model - the model the chat called; `undefined` when the caller can't tell
 *
 * @example
 * chatFailureOf({ reason: "model-unreachable", host: "localhost:11434" }, "Ollama didn't answer.", ollamaModel);
 * // { reason: "model-unreachable", provider: "Ollama", address: "localhost:11434", alias: "local", local: true }
 */
export function chatFailureOf(
  cause: ChatFailureCause,
  message: string,
  model: FailedModel | undefined,
): RunFailure | undefined {
  return runFailureOf({ ...cause, error: message }, model);
}
