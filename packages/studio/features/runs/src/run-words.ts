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

/** What the Runs list says in place of rows (mc 15.1; states R1 to R6, R10 and R17). */
export const emptyListWords = {
  noRunsTitle: "No runs yet",
  noRunsBody:
    "A run is one time a workflow or agent does its job. Start one from a workflow's Run button, or let a routine start it.",
  goToWorkflows: "Go to Workflows",
  onlyTestRuns: "Only test runs so far.",
  showTestRuns: "Show test runs",
  /** A status chip with no runs; no button, since All is next to it (D13). */
  status: {
    live: "Nothing is running.",
    "needs-you": "Nothing is waiting for you.",
    failed: "No failed runs.",
  },
  loading: "Loading runs",
  loadFailed: "Couldn't load runs",
  notAnswering: "The engine isn't answering. It may still be starting.",
  showingLast: "The engine isn't answering. Showing what it said last.",
};

/** The Runs page's own words (checklist part 1, 1.2, 1.3 and R-D1). */
export const pageWords = {
  title: "Runs",
  sentence: "A run is one time a workflow or agent does its job.",
  filters: "Filters",
  status: "Status",
  statusChips: { all: "All", live: "Live", "needs-you": "Needs you", failed: "Failed" },
  testRuns: "Test runs",
  testTag: "Test",
  running: (count: number) => `${count} running`,
};
