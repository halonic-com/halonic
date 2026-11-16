import type { SampleStepId } from "./api.ts";

/** The words of the Try the sample card (microcopy 5, flow-first-run 3.3). */
export const sampleCardWords = {
  heading: "Try the sample",
  caption: (done: number) => `${done} of 3 done`,
  finished: "You've seen it work.",
  startOwnWorkspace: "Start your own workspace",
  /** Read after a done step's title, as the mark itself is hidden from screen readers. */
  doneNote: "done",
} as const;

/** Each step's title and the hint under it. */
export const sampleStepWords: Readonly<Record<SampleStepId, { title: string; hint: string }>> = {
  start: {
    title: "Start a support request",
    hint: "An invented customer asks for a refund.",
  },
  decide: {
    title: "Approve or reject the reply",
    hint: "The run waits for you before it finishes.",
  },
  see: {
    title: "See what it did",
    hint: "Every step, from the run log.",
  },
};
