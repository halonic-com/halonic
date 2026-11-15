import { errorMessageFor } from "@halonicjs/studio-shell";
import { stateWords } from "./changes-words.ts";

/** Why a git call failed: a kinded error's own reason, else that git didn't answer. */
export function loadFailureReason(error: unknown): string {
  const message = errorMessageFor(error, { title: stateWords.loadFailed });
  const reason = message.body.trim();
  return message.kind === "internal" || reason === "" ? stateWords.notAnswering : reason;
}
