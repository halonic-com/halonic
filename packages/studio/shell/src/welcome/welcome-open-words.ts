/**
 * What an opening Recent row says it waits on (HAL-19599, the board's principle that progress is
 * visible). Nina checks these as a team wording check.
 */
export const welcomeOpenWords = {
  steps: {
    /** Held until the start's engine is ready. */
    engine: "Starting the engine…",
    /** The folder's workspace loads and its services start. */
    workspace: "Reading the workspace…",
  },
} as const;

/** The step an opening Recent row is at. */
export type RecentOpenStep = keyof typeof welcomeOpenWords.steps;
