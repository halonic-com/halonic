import { capitalised } from "../run-words.ts";

/**
 * What a screen reader hears when the open run's status changes (mc 19.3, revision 115): one
 * sentence that says the state first, then what it waits for or what it did. The forms without a
 * step, and a wait that isn't for a time or a child run, aren't in 19.3: they are the same
 * sentences cut short, a team decision under HAL-2282 (HAL-12456).
 */
export const runChangeWords = {
  needsYou: (shortId: string, what: string) => `Run ${shortId} needs you. ${what}`,
  /** "Waiting for your approval: Sorter wants to use create_note (notes-mcp)." */
  approval: (ask: string) => `Waiting for your approval: ${ask}.`,
  /** Who asks when a tool step, which has no agent, asks: `Tool step "merge"` (HAL-18635). */
  toolStep: (stepId: string) => `Tool step "${stepId}"`,
  /** An open question "Allow this address?": the dialog says the rest (HAL-15831). */
  answer: (step: string) => `Waiting for your answer in the step ${step}.`,
  runningAgain: (shortId: string) => `Run ${shortId} is running again.`,
  waitingUntil: (shortId: string, time: string) => `Run ${shortId} is waiting until ${time}.`,
  waitingForChild: (shortId: string, child: string) =>
    `Run ${shortId} is waiting for child run ${child}.`,
  waiting: (shortId: string) => `Run ${shortId} is waiting.`,
  /** With what it sent or saved and its cost after it, when it has them: "Sent 1 email, estimated cost €0.01." */
  /** The ending, when the receipt names one, before what it sent: "Ending: Finished without the reply." */
  finished: (shortId: string, parts: readonly string[], ending?: string) =>
    [
      `Run ${shortId} finished.`,
      ...(ending === undefined ? [] : [`Ending: ${ending}.`]),
      ...(parts.length === 0 ? [] : [`${capitalised(parts.join(", "))}.`]),
    ].join(" "),
  failedIn: (shortId: string, step: string) =>
    `Run ${shortId} failed in the step ${step}. The banner at the top says what to do.`,
  failed: (shortId: string) => `Run ${shortId} failed. The banner at the top says what to do.`,
  budgetSpent: (shortId: string, spent: string, budget: string) =>
    `Run ${shortId} stopped at its budget: estimated ${spent} of ${budget}.`,
  budget: (shortId: string) => `Run ${shortId} stopped at its budget.`,
  cancelledIn: (shortId: string, step: string) =>
    `Run ${shortId} was cancelled in the step ${step}.`,
  cancelled: (shortId: string) => `Run ${shortId} was cancelled.`,
  /** A Try it or test run that ended at a step it couldn't try (the chip's "Couldn't try"). */
  cantTry: (shortId: string, step: string) => `Run ${shortId} couldn't try the step ${step}.`,
};
