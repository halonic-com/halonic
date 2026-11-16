import { clockTime } from "@halonicjs/studio-feature-inbox/api";

/** The words of the status section (decided with Sofia's review, HAL-7814). */
export const statusWords = {
  refusalsHeading: "Recent refusals",
  /** Under "Recent refusals": the listed tools that wait for a person's approval. */
  waitingHeading: "Waiting for approval",
  /** One tool of the group; the name was cut and escaped by the engine. */
  waitingLine: (source: string, name: string) =>
    `${source}: "${name}" waits for your approval and stays off.`,
  /** The feed lives in memory and starts at launch, so the line says "since Halonic started". */
  nothingRefused: "Nothing refused since Halonic started.",
  /** Under a full list, so the user can tell the list stops there. */
  capNote: (limit: number) => `Showing the last ${limit} refusals.`,
  /** When a refusal arrived, as the Inbox says it: the time today, the day and time before. */
  time: (at: Date, now: Date = new Date()) => clockTime(at, now),
  loading: "Loading refusals",
  loadFailed: "Couldn't load refusals",
  tryAgain: "Try again",
  /** What a screen reader hears when a connector's state changes while the page is open. */
  stateChanged: (name: string, label: string) => `${name}: ${label}.`,
} as const;
