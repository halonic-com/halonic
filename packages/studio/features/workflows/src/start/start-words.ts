/** The words of starting a run and of the strip that shows one (microcopy 9.6 and 9.7; states C18, C19, C25, C26, D7, D8). */
export const startWords = {
  run: "Run",
  /** The card's title: the workflow's name follows (checklist 10.13). */
  runNamed: (name: string) => `Run ${name}`,
  filledFromFirstTest: "Filled from the first test.",
  cancel: "Cancel",
  cardKind: "START A RUN",
  closeCard: "Close",
  inputField: "Input (JSON)",
  inputNotObject: "The input has to be a JSON object, such as {}.",
  startRun: "Start run",
  starting: "Starting…",
  /** Decided by the team (HAL-10225): the card between Start run and the run showing in the runs. */
  waitingForRun: "Run started. Waiting for it to appear…",
  tryAgain: "Try again",
  /** The trust check's own word, on a start refused because the workspace isn't trusted (C144 RT1). */
  review: "Review",
  /** D7 and C19: the reason follows the colon; the engine's own words end in a full stop already. */
  couldntStart: (reason: string) => `Couldn't start the run: ${reason}`,
  clearStrip: "Stop showing this run",
  failedChip: "Failed",
  /** The status dot's text for assistive technology, one per mark. */
  mark: {
    done: "Done",
    running: "Running",
    waiting: "Waiting",
    failed: "Failed",
    stopped: "Stopped",
  },
  strip: (shortId: string, how: string) => `Showing run ${shortId} · ${how}`,
  /** How a shown run ended, in the Runs row's words (D8). */
  ended: {
    done: "done",
    failed: (step: string) => `failed in ${step}`,
    budget: (step: string) => `budget reached in ${step}`,
    cancelled: (step: string) => `cancelled in ${step}`,
    running: (step: string) => `running in ${step}`,
    waiting: (step: string) => `waiting in ${step}`,
  },
  /**
   * What screen readers hear when the docked run's state changes (microcopy 19.3, canvas strip,
   * and 9.6). A step name that ends in its own mark ("Approve this reply?") gets no full stop.
   */
  announce: {
    needsYou: (shortId: string, step: string) =>
      `Run ${shortId} needs you, waiting in ${withFullStop(step)}`,
    done: (shortId: string) => `Run ${shortId} is done.`,
    failed: (shortId: string, step: string) => `Run ${shortId} failed in ${withFullStop(step)}`,
    cancelled: (shortId: string, step: string) =>
      `Run ${shortId} was cancelled in the step ${withFullStop(step)}`,
    runningAgain: (shortId: string) => `Run ${shortId} is running again.`,
  },
} as const;

function withFullStop(text: string): string {
  return /[.!?…]$/.test(text) ? text : `${text}.`;
}
