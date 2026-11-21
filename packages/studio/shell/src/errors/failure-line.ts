import { type EngineWords, engineWords } from "../engine/engine-words.ts";
import { engineReasonFor } from "./error-message.ts";

/** Words that start one of our own sentences, so their capital goes when a reason follows a colon. */
const commonFirstWords = new Set([
  "The",
  "A",
  "An",
  "This",
  "That",
  "That's",
  "These",
  "Those",
  "It",
  "It's",
  "Its",
  "There",
  "There's",
  "No",
  "Nothing",
  "Your",
  "You",
  "You're",
  "Some",
  "Something",
]);

/**
 * A reason as it reads after a colon: its first letter is lower-cased only when the first word is
 * a common one ("The disk is full" is "the disk is full"), so a name stays as it is ("Google isn't
 * answering", "Halonic on your computer …"). Punctuation is left as it was.
 */
export function lowerAfterColon(reason: string): string {
  const firstWord = reason.split(/[\s,]/, 1)[0] ?? "";
  return commonFirstWords.has(firstWord)
    ? reason.charAt(0).toLowerCase() + reason.slice(1)
    : reason;
}

/**
 * An action that failed, as the microcopy's 1.1 shape: "Couldn't save your progress: the engine
 * isn't answering." The reason is the host's message after a colon ({@link reasonAfterColon}). An
 * `internal` error, which has no safe message, gives the generic sentence as the reason. An engine
 * that can't be reached ({@link engineReasonFor}) gives `engine.notAnswering`, the words for
 * where Studio runs: "Couldn't start the sign-in: the engine isn't answering. It may still be
 * starting." (UX check G2).
 */
export function failureLine(
  action: string,
  error: unknown,
  engine: EngineWords = engineWords["desktop-app"],
): string {
  return `Couldn't ${action}: ${reasonAfterColon(engineReasonFor(error, engine.notAnswering))}.`;
}

/**
 * A sentence as the reason after a colon: without its last full stop, and as {@link lowerAfterColon}
 * reads it.
 *
 * @example
 * reasonAfterColon("The engine isn't answering. It may still be starting.");
 * // "the engine isn't answering. It may still be starting"
 * reasonAfterColon("Halonic on your computer isn't answering."); // "Halonic on your computer isn't answering"
 */
export function reasonAfterColon(sentence: string): string {
  return lowerAfterColon(sentence.replace(/\.$/, ""));
}
