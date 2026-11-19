import { EngineNotAnswering } from "../engine/engine-not-answering.ts";
import { type EngineWords, engineWords } from "../engine/engine-words.ts";
import { errorReasonFor } from "./error-message.ts";

/** Words that start one of our own sentences, so their capital goes when a reason follows a colon. */
const commonFirstWords = new Set(["The", "A", "An", "This", "That", "It", "There", "No", "Your"]);

/**
 * An action that failed, as the microcopy's 1.1 shape: "Couldn't save your progress: the engine
 * isn't answering." The reason is the host's message after a colon, with no closing full stop. Its
 * first letter is lower-cased only when the first word is a common one ("The disk is full"), so a
 * name stays as it is ("Google isn't answering"). An `internal` error, which has no safe message, gives the generic sentence as the reason.
 * An engine that can't be reached ({@link EngineNotAnswering}) gives `engine.notAnswering`, the
 * words for where Studio runs: "Couldn't start the sign-in: the engine isn't answering. It may
 * still be starting." (UX check G2).
 */
export function failureLine(
  action: string,
  error: unknown,
  engine: EngineWords = engineWords["desktop-app"],
): string {
  const reason = error instanceof EngineNotAnswering ? engine.notAnswering : errorReasonFor(error);
  return `Couldn't ${action}: ${reasonAfterColon(reason)}.`;
}

/**
 * A sentence as the reason after a colon: without its last full stop, and with its first letter
 * lower-cased when the first word is a common one, as {@link failureLine} does.
 *
 * @example
 * reasonAfterColon("The engine isn't answering. It may still be starting.");
 * // "the engine isn't answering. It may still be starting"
 * reasonAfterColon("Halonic on your computer isn't answering."); // "Halonic on your computer isn't answering"
 */
export function reasonAfterColon(sentence: string): string {
  const message = sentence.replace(/\.$/, "");
  const firstWord = message.split(/[\s,]/, 1)[0] ?? "";
  return commonFirstWords.has(firstWord)
    ? message.charAt(0).toLowerCase() + message.slice(1)
    : message;
}
