/** The runs a restart would end, as the restart dialog counts them. */
export interface RestartRuns {
  /**
   * Runs the app itself runs that a restart stops: a run with a step in progress, and a Claude
   * Code or Codex run that waits for the person, because its wait is a live program. Halonic
   * runs that wait for an answer aren't counted: their wait comes back from the run log.
   */
  readonly running: number;
  /** How many of `running` wait for the person (Claude Code and Codex only). */
  readonly waitingForYou: number;
}

/** Asked each time the restart dialog could open, so the count is the one of that moment. */
export interface RestartRunsHost {
  /** The runs a restart ends now. Reads only; it never stops or starts a run. */
  count(): Promise<RestartRuns>;
}
