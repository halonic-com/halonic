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
  /**
   * `sandbox-inbox.footer` (mc 23.3): the card's last line, and the fixed card's only line. True
   * for a scheduled routine too, unlike "Nothing ran again by itself".
   */
  footer:
    "Routines start again at their next time once the sandbox works. To let one agent run without the sandbox, change it in that agent's settings.",
  /** `sandbox-inbox.check-again` */
  checkAgain: "Check again",
  /** `sandbox-inbox.fixed-notice`: the Notices row after the row was seen as Fixed. */
  fixedNotice: "The sandbox is ready. Run each routine that didn't run again from its page.",
  /** `sandbox-inbox.checking` */
  checking: "Checking…",
  /** `sandbox-inbox.checked-ready`: said once when a press finds the sandbox ready. */
  checkedReady: "Sandbox checked: ready.",
  /** `sandbox-inbox.checked-refused`: said once when a press finds it still refuses; the reason follows. */
  checkedRefused: (reason: string) => `Sandbox checked: not ready. ${reason}`,
  /** `sandbox-inbox.check-failed` */
  checkFailed: "Halonic couldn't check the sandbox. Try again.",
  /** `sandbox-inbox.docs` */
  docs: "Read the guide",
  /** `sandbox-inbox.runs-heading` */
  runsHeading: "Didn't run because of this",
  /** Said in place of the runs while they can't be read (states audit gap 5); wording to confirm with Noah. */
  runsFailed: "Couldn't load the runs that didn't run.",
  /** `sandbox-inbox.open-run` */
  openRun: "Open run",
  /** `sandbox-inbox.fixed` */
  fixed: "Fixed",
  /** `sandbox-inbox.name`: the source's name, for "Loading the Sandbox setup". */
  name: "Sandbox",
} as const;

/** Where the guide lives; the catalogue's docs key follows it (P10: the CLI's `docsBase`). */
export const sandboxDocsBase = "https://docs.halonic.dev";
