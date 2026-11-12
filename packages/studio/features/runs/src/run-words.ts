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

/** The When column's detail under the start time, once the run has ended (checklist 1.2). */
export const whenWords = {
  took: (took: string) => `took ${took}`,
};

/**
 * The Started by column (mc 15.1; checklist 1.2 and 1.5b CU4). A run started
 * in the terminal and a child run have no words in the microcopy yet: they
 * follow "You, with Run" and the Run column (HAL-7094).
 */
export const startedByWords = {
  /** `halonic run`, or Run now on a routine. */
  run: "You, with Run",
  /** No trigger: `halonic run` in a terminal, the only way a run starts without one in v0.1. */
  terminal: "You, in the terminal",
  mail: "A message arrived",
  signal: "A signal arrived",
  /** The routine's schedule, in `halonic routines`' words: "Schedule · weekdays at 08:00". */
  schedule: (when: string | undefined) =>
    when === undefined ? "Schedule" : `Schedule · ${when.charAt(0).toLowerCase()}${when.slice(1)}`,
  catchUp: "Caught up after sleep",
  test: (testCase: string) => `Test “${testCase}”`,
  /** A test run whose case the run log doesn't name. */
  testCase: "A test case",
  /** A child run: the run that started it, by its short id. */
  parent: (shortId: string) => `Run ${shortId}`,
};

/**
 * What a screen reader hears for a row (mc 19.3 Run row, revision 68):
 * "Run 01jd8q, Support reply, needs you, waiting for 2 approvals. Started by
 * a message, 10:40."
 */
export const rowLabelWords = {
  /**
   * What follows "Started by" in the sentence: the Started by column's
   * meaning, in words that read on from it (HAL-7125).
   */
  startedBy: {
    run: "you, with Run",
    terminal: "you, in the terminal",
    mail: "a message",
    signal: "a signal",
    schedule: (when: string | undefined) =>
      when === undefined
        ? "the schedule"
        : `the schedule, ${when.charAt(0).toLowerCase()}${when.slice(1)}`,
    catchUp: "a catch-up after sleep",
    test: (testCase: string) => `the test case “${testCase}”`,
    testCase: "a test case",
    parent: (shortId: string) => `run ${shortId}`,
  },
  standing: {
    running: "running",
    "needs-you": "needs you",
    waiting: "waiting",
    done: "done",
    failed: "failed",
    budget: "stopped at its budget",
    cancelled: "stopped",
    "cant-try": "couldn't try",
  },
  failedIn: (step: string) => `failed in the step ${step}`,
  row: (
    shortId: string,
    workflow: string,
    what: string,
    startedBy: string,
    time: string,
    test: boolean,
  ) =>
    `Run ${shortId}, ${workflow}, ${what}. Started by ${startedBy}, ${time}${test ? ", test run" : ""}.`,
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

/**
 * The run page's header, banners and states (mc 15.2 revision 94, 9.7 and
 * 19.3; states R13, R18, R21, R22 and R24). A banner's `name` is its hidden
 * title, which makes it a named region (a11y 13.2).
 */
export const runPageWords = {
  title: (shortId: string) => `Run ${shortId}`,
  kindLabel: (workflow: string) => `Run · ${workflow}`,
  startedToday: (time: string) => `today ${time}`,
  startedYesterday: (time: string) => `yesterday ${time}`,
  took: (took: string) => `took ${took}`,
  updatesLive: "updates live",
  loading: (shortId: string) => `Loading run ${shortId}`,
  loadFailed: (shortId: string) => `Couldn't load run ${shortId}`,
  notHere: "This run isn't in this workspace any more.",
  reviewInInbox: "Review in Inbox",
  openRun: (shortId: string) => `Open run ${shortId}`,
  waitingForYouName: "Waiting for you",
  waitingName: "Waiting",
  failedName: "Run failed",
  budgetName: "Stopped at its budget",
  /** One tool approval, named by its step until the run page has the approval card's title. */
  approval: (step: string) =>
    `Waiting for your approval in the step ${step}. Nothing runs until you decide.`,
  approvals: (count: number) => `Waiting for ${count} approvals. Nothing runs until you decide.`,
  waitStep: (description: string) => `Waiting for you: ${description}`,
  waitStepNoDescription: (step: string) => `Waiting for you in the step ${step}.`,
  timer: (time: string) => `Waiting until ${time}.`,
  childRun: (shortId: string, workflow: string) =>
    `Waiting for child run ${shortId} (${workflow}).`,
  childRunOnly: (shortId: string) => `Waiting for child run ${shortId}.`,
  /** R24's general banner, until the banners by cause (HAL-1845). */
  failed: (workflow: string, step: string, message: string) =>
    message === ""
      ? `${workflow} failed in the step ${step}. Halonic can't tell the cause yet.`
      : `${workflow} failed in the step ${step}. Halonic can't tell the cause yet: ${asSentence(message)}`,
  budgetTitle: "Stopped at its estimated budget",
  budget: (workflow: string, step: string, message: string) =>
    message === ""
      ? `${workflow} stopped in the step ${step}.`
      : `${workflow} stopped in the step ${step}: ${asSentence(message)}`,
  budgetChecks:
    "Halonic checks the budget before each model call, so calls already under way can take a run over it.",
  cancelledIn: (workflow: string, step: string) =>
    `${workflow} was cancelled in the step ${step}. Nothing after it ran.`,
  cancelledBeforeStart: (workflow: string) => `${workflow} was cancelled before it started.`,
};

/** The text as a sentence: it keeps its own ".", "?" or "!", and gets a full stop if it has none. */
function asSentence(text: string): string {
  return /[.?!]$/.test(text) ? text : `${text}.`;
}
