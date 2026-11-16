import { errorReasonFor } from "@halonicjs/studio-shell";

/** Words that start one of our own sentences, so their capital goes when a reason follows a colon. */
const commonFirstWords = new Set(["The", "A", "An", "This", "That", "It", "There", "No", "Your"]);

/**
 * An action that failed, as the microcopy's 1.1 shape: "Couldn't save your progress: the engine
 * isn't answering." The reason is the host's message after a colon, with no closing full stop. Its
 * first letter is lower-cased only when the first word is a common one ("The disk is full"), so a
 * name stays as it is ("Google isn't answering"). An `internal` error, which has no safe message, gives the generic sentence as the reason.
 */
export function failureLine(action: string, error: unknown): string {
  const message = errorReasonFor(error).replace(/\.$/, "");
  const firstWord = message.split(/[\s,]/, 1)[0] ?? "";
  const reason = commonFirstWords.has(firstWord)
    ? message.charAt(0).toLowerCase() + message.slice(1)
    : message;
  return `Couldn't ${action}: ${reason}.`;
}
