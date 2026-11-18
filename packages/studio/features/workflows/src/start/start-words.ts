/** The words of starting a run and of the strip that shows one (microcopy 9.6 and 9.7; states C18, C19, C25, C26, D7, D8). */
export const startWords = {
  run: "Run",
  cardKind: "START A RUN",
  closeCard: "Close",
  inputField: "Input (JSON)",
  inputNotObject: "The input has to be a JSON object, such as {}.",
  startRun: "Start run",
  starting: "Starting…",
  /** Decided by the team (HAL-10225): the card between Start run and the run showing in the runs. */
  waitingForRun: "Run started. Waiting for it to appear…",
  tryAgain: "Try again",
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
} as const;
