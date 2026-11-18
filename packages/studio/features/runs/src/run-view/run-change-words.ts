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
  runningAgain: (shortId: string) => `Run ${shortId} is running again.`,
  waitingUntil: (shortId: string, time: string) => `Run ${shortId} is waiting until ${time}.`,
  waitingForChild: (shortId: string, child: string) =>
    `Run ${shortId} is waiting for child run ${child}.`,
  waiting: (shortId: string) => `Run ${shortId} is waiting.`,
  /** With what it sent or saved and its cost after it, when it has them: "Sent 1 email, estimated cost €0.01." */
  finished: (shortId: string, parts: readonly string[]) =>
    parts.length === 0
      ? `Run ${shortId} finished.`
      : `Run ${shortId} finished. ${capitalised(parts.join(", "))}.`,
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
