/**
 * The Inbox's sentences for the sandbox row and its card (checklist 3.5, 3.9), asked for by key.
 * The reason and the fix come from the one catalogue, `sandboxStartWords`. These words are
 * placeholders until HAL-1784 is approved: reviewers check the keys, not the sentences.
 */
export const sandboxInboxWords = {
  /** `sandbox-inbox.title`: the row's and the card's title. */
  title: (routines: number): string =>
    routines === 1 ? "1 routine didn't run" : `${routines} routines didn't run`,
  /** `sandbox-inbox.fixed-title`: the title once a check passed. */
  fixedTitle: "The sandbox is ready",
  /** `sandbox-inbox.fixed-line`: the line under it. Nothing runs again by itself. */
  fixedLine: "Nothing ran again by itself. Run each one again from its page.",
  /** `sandbox-inbox.check-again` */
  checkAgain: "Check again",
  /** `sandbox-inbox.checking` */
  checking: "Checking…",
  /** `sandbox-inbox.check-failed` */
  checkFailed: "Halonic couldn't check the sandbox. Try again.",
  /** `sandbox-inbox.docs` */
  docs: "Read the guide",
  /** `sandbox-inbox.runs-heading` */
  runsHeading: "Didn't run because of this",
  /** `sandbox-inbox.open-run` */
  openRun: "Open run",
  /** `sandbox-inbox.fixed` */
  fixed: "Fixed",
  /** `sandbox-inbox.name`: the source's name, for "Loading the Sandbox setup". */
  name: "Sandbox",
} as const;

/** Where the guide lives; the catalogue's docs key follows it (P10: the CLI's `docsBase`). */
export const sandboxDocsBase = "https://docs.halonic.dev";
