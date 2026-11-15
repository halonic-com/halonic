import { errorMessageFor } from "@halonicjs/studio-shell";
import { stateWords } from "./changes-words.ts";

/** Why a git call failed: a kinded error's own reason, else that git didn't answer. */
export function loadFailureReason(error: unknown): string {
  const message = errorMessageFor(error, { title: stateWords.loadFailed });
  const reason = asSentence(message.body.trim());
  return message.kind === "internal" || reason === "" ? stateWords.notAnswering : reason;
}

/** Git's first line often starts with its own label ("fatal: ", "error: "); drop it. */
function asSentence(line: string): string {
  const text = line.replace(/^(fatal|error|warning):\s*/i, "");
  if (text === "") return "";
  const sentence = text.charAt(0).toUpperCase() + text.slice(1);
  return /[.!?]$/.test(sentence) ? sentence : `${sentence}.`;
}
