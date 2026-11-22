import { errorKindOf } from "@halonicjs/std";
import { errorMessageFor } from "@halonicjs/studio-shell";
import type { UpdatesOutcome } from "./changes-list-state.ts";
import { phoneWords, stateWords } from "./changes-words.ts";

/**
 * Why a git call failed: a kinded error's own reason, else that git didn't answer ("Halonic on
 * your computer isn't answering." on a phone, where git runs on the computer).
 */
export function loadFailureReason(error: unknown, phone = false): string {
  const message = errorMessageFor(error, { title: stateWords.loadFailed });
  const reason = asSentence(message.body.trim());
  if (message.kind !== "internal" && reason !== "") return reason;
  return phone ? phoneWords.notAnswering : stateWords.notAnswering;
}

/**
 * Why Get updates didn't work. A `conflict` (the shared copy changed a file Halonic leaves to git)
 * is refused the same way until the person gets the updates with git, so it comes back as
 * `refused`, which has no Try again; anything else is `failed`.
 */
export function updatesFailure(error: unknown): UpdatesOutcome {
  const reason = loadFailureReason(error);
  return errorKindOf(error) === "conflict"
    ? { kind: "refused", reason }
    : { kind: "failed", reason };
}

/** Git's first line often starts with its own label ("fatal: ", "error: "); drop it. */
function asSentence(line: string): string {
  const text = line.replace(/^(fatal|error|warning):\s*/i, "");
  if (text === "") return "";
  const sentence = text.charAt(0).toUpperCase() + text.slice(1);
  return /[.!?]$/.test(sentence) ? sentence : `${sentence}.`;
}
