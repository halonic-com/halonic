import { errorMessageFor } from "@halonicjs/studio-shell";
import { emptyListWords } from "./run-words.ts";

/**
 * Why runs couldn't load (states R17 and R21): a kinded error's own reason,
 * else that the engine isn't answering, since a load that fails without a
 * kind never reached it.
 */
export function loadFailureReason(error: unknown): string {
  const message = errorMessageFor(error, { title: emptyListWords.loadFailed });
  const reason = message.body.trim();
  return message.kind === "internal" || reason === "" ? emptyListWords.notAnswering : reason;
}
