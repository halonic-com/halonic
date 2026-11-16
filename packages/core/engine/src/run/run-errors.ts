// What a run's `error` says when it ends for a reason of the engine's or a person's.

/**
 * The `error` of a run whose harness call was gone when a person answered
 * the approval it asked for: the engine stopped while the run waited.
 */
export const harnessGoneError =
  "The engine stopped while the harness waited for an answer, so the harness can't go on.";

/** The `error` of a run someone cancelled; screens word the reason themselves. */
export const cancelledError = "The run was cancelled.";
