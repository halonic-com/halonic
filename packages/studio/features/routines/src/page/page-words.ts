import { engineWordsOf, errorReasonFor } from "@halonicjs/studio-shell";

/** The routine page's words (microcopy 12.3, flow-routines 3.1, 3.2 and 3.10). */
export const pageWords = {
  kind: "ROUTINE",
  loading: (name: string) => `Loading ${name}`,
  stillLoading: "Still loading",
  loadFailedTitle: "Couldn't load this routine",
  tryAgain: "Try again",
  off: "Off",
  changesNotLive: "Changes not live yet",
  neverLive: "This routine isn't live yet, so it doesn't run.",
} as const;

/**
 * The reason a failed read gives, as one sentence ending in a full stop. An error that isn't the
 * engine's own kinded one says the engine isn't answering (`notAnswering`), never its raw text.
 */
export function failureReason(
  error: unknown,
  notAnswering: string = engineWordsOf({}).notAnswering,
): string {
  const message = errorReasonFor(error, notAnswering);
  return message.endsWith(".") ? message : `${message}.`;
}
