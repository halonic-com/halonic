/** The agent page's words (microcopy 8.4, flow-agents 3.1 and 8; states R9). */
export const pageWords = {
  kind: "AGENT",
  loading: (name: string) => `Loading ${name}`,
  stillLoading: "Still loading",
  loadFailedTitle: "Couldn't load this agent",
  tryAgain: "Try again",
  views: "Agent views",
  saveFailed: "The file couldn't be written.",
  couldntSave: (reason: string) => `Couldn't save: ${reason}`,
  runsHeading: "Runs",
  /** R9: Try it records no run in 0.1, and a run doesn't say which agent ran in it. */
  noRuns: "No runs with this agent yet.",
} as const;
