/** The words of the status section (decided with Sofia's review, HAL-7814). */
export const statusWords = {
  refusalsHeading: "Recent refusals",
  /** The feed lives in memory and starts at launch, so the line says "since Halonic started". */
  nothingRefused: "Nothing refused since Halonic started.",
  /** Under a full list, so the user can tell the list stops there. */
  capNote: (limit: number) => `Showing the last ${limit} refusals.`,
  /** When a refusal arrived, as the hour and minute on this computer. */
  time: (at: Date) => at.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
  loading: "Loading refusals",
  loadFailed: "Couldn't load refusals",
  tryAgain: "Try again",
  /** What a screen reader hears when a connector's state changes while the page is open. */
  stateChanged: (name: string, label: string) => `${name}: ${label}.`,
} as const;
