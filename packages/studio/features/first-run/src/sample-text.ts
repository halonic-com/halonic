import type { SampleStepId } from "./api.ts";

/** The words of the Try the sample card (microcopy 5, flow-first-run 3.3). */
export const sampleCardWords = {
  heading: "Try the sample",
  caption: (done: number) => `${done} of 3 done`,
  finished: "You've seen it work.",
  seeTests: "See its tests",
  startOwnWorkspace: "Start your own workspace",
  /** What a screen reader hears for a step's row (microcopy 19.2): "Step 2 of 3: See what it did, not done". */
  stepLabel: (position: number, title: string, done: boolean) =>
    `Step ${position} of 3: ${title}, ${done ? "done" : "not done"}`,
  /** Said when a step finishes while the card is open (microcopy 19.2). */
  progressAnnouncement: (done: number) => `Try the sample: ${done} of 3 done.`,
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

/** The invented customer's email that step 1 puts in the request form, as the sample's `refund-question` example has it. */
export const sampleRefundEmail = "Hi, my order #1042 arrived damaged. Can I get a refund?";
