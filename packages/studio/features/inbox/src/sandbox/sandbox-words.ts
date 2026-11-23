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
  footer: "Routines start again at their next time once the sandbox works.",
  /** `sandbox-inbox.check-again` */
  checkAgain: "Check again",
  /**
   * `sandbox-inbox.fixed-notice` (mc 23.3): the Notices row after the row was seen as Fixed, which
   * says which routines didn't run; the row adds **Fixed**. They start again at their next time.
   */
  fixedNotice: (routines: number): string =>
    `The sandbox couldn't start on this computer · ${sandboxInboxWords.title(routines)}`,
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

/**
 * The sentences of the Inbox's on-hold rows (checklist 3.8, microcopy 23.4 "File changed, Inbox
 * setup row"), one per agent whose On this computer choice is on hold. Placeholders until HAL-1784
 * is approved, like the ones above.
 */
export const onHoldInboxWords = {
  /** `on-hold-inbox.title`: the row's and the card's title. */
  title: (agent: string): string => `Confirm again: ${agent} runs in the sandbox for now`,
  /** `on-hold-inbox.line`: the line under the title. */
  line: (agent: string): string => `${agent}'s file changed since you chose On this computer.`,
  /** `on-hold-inbox.notice`: the Notices row the Fixed row leaves; the row adds **Fixed**. */
  notice: (agent: string): string =>
    `${onHoldInboxWords.title(agent)} · ${onHoldInboxWords.line(agent)}`,
  /** `on-hold-inbox.name`: the source's name, for "Loading the On this computer setup". */
  name: "On this computer",
} as const;

/** Where the guide lives; the catalogue's docs key follows it (P10: the CLI's `docsBase`). */
export const sandboxDocsBase = "https://docs.halonic.dev";
