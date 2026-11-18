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
  nameLabel: "Routine name",
  more: (name: string) => `More actions for ${name}`,
  delete: "Delete",
  rename: "Rename",
  renameTitle: "Rename routine",
  renameNameField: "Name",
  renameNameMissing: "Give it a name.",
  couldntRename: (name: string, reason: string | undefined) =>
    reason === undefined
      ? `Couldn't rename ${name}.`
      : `Couldn't rename ${name}: ${reason.replace(/\.$/, "")}.`,
  runNow: "Run now",
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

/** The toasts of Run now (flow-routines 3.8, microcopy 12.3). */
export const runNowWords = {
  started: (name: string, shortId: string) => `Run started · ${name} · Run ${shortId}`,
  openRun: "Open run",
  signedOut: (account: string) => `Not started: ${account} is signed out.`,
  notTrusted: (name: string) => `Not started: ${name} isn't trusted yet.`,
  targetNotFound: (target: string) => `Not started: ${target} isn't in this hub any more.`,
  targetNeverLive: (target: string) => `Not started: ${target} isn't live yet.`,
  targetInTrash: (target: string) => `Not started: ${target} is in the trash.`,
  couldntStart: (name: string) => `Couldn't start ${name}.`,
} as const;
