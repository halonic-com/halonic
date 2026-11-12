/** The words of the status section (decided with Sofia's review, HAL-7814). */
export const statusWords = {
  refusalsHeading: "Recent refusals",
  /** The feed lives in memory and starts at launch, so the line says "since Halonic started". */
  nothingRefused: "Nothing refused since Halonic started.",
  /** Under a full list, so the user can tell the list stops there. */
  capNote: (limit: number) => `Showing the last ${limit} refusals.`,
  loading: "Loading refusals",
  loadFailed: "Couldn't load refusals",
  notAnswering: "The engine isn't answering.",
  engineLost: "The engine isn't answering. Showing what it said last.",
  tryAgain: "Try again",
  /** What a screen reader hears when a connector's state changes while the page is open. */
  stateChanged: (name: string, label: string) => `${name}: ${label}.`,
} as const;
