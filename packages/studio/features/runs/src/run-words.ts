// The Runs feature's words (microcopy revision 94: 9.7 Row line, 15.1 and
// 15.2). The run row says what `halonic runs` says, word for word, so
// the two lists read the same.

/** The status chip's word for each standing (mc 15.2, Status chips). */
export const chipWords = {
  running: "Running",
  "needs-you": "Needs you",
  waiting: "Waiting",
  done: "Done",
  failed: "Failed",
  budget: "Stopped · budget",
  cancelled: "Stopped",
  "cant-try": "Couldn't try",
} as const;

/** The line under What ran, by what the run is doing (mc 9.7 Row line, revision 71). */
export const rowLineWords = {
  inStep: (step: string) => `In ${step}`,
  waitingForYou: (description: string) => `Waiting for you: ${description}`,
  waitingInStep: (step: string) => `Waiting for you in the step ${step}`,
  /** A tool approval: names the step whose agent asked, until the tool action catalogue exists. */
  waitingForApproval: (step: string) => `Waiting for your approval in the step ${step}`,
  waitingForApprovals: (count: number) => `Waiting for ${count} approvals`,
  waitingUntil: (time: string) => `Waiting until ${time}`,
  waitingForChildRun: (shortId: string) => `Waiting for child run ${shortId}`,
  waitingIn: (step: string) => `Waiting in ${step}`,
  sentNothing: "Sent nothing",
  finishedIn: (step: string) => `Finished in ${step}`,
  /** The failed banner's first sentence, until the banners by cause (HAL-1845). */
  failedIn: (workflow: string, step: string) => `${workflow} failed in the step ${step}.`,
  budgetReached: (step: string, took: string) => `Budget reached in ${step} after ${took}`,
  cancelledIn: (step: string, took: string) => `Cancelled in ${step} after ${took}`,
};

/** The cost part of a run's line (mc 15.2, W1 and revision 68). */
export const costWords = {
  estimated: (amount: string) => `estimated cost ${amount}`,
  withoutPrice: (calls: number) =>
    calls === 1 ? "1 call without a price" : `${calls} calls without a price`,
  plusWithoutPrice: (calls: number) =>
    calls === 1 ? "(+1 call without a price)" : `(+${calls} calls without a price)`,
};

/** What joins the parts of a line: "Sent nothing · estimated cost €0.004". */
export const lineSeparator = " · ";
