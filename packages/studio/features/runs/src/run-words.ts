// The Runs feature's words (microcopy revision 94: 9.7 Row line, 15.1 and
// 15.2). The run row says what `halonic runs` says, word for word, so
// the two lists read the same.

import { escapeHidden } from "@halonicjs/std";

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
  /** A run that ended: a final state is where the flow ends, not a step, so no "in Done" (HAL-11693). */
  finished: "Finished",
  finishedInTime: (took: string) => `Finished in ${took}`,
  /** The failed banner's first sentence, until the banners by cause (HAL-1845). */
  failedIn: (workflow: string, step: string) => `${workflow} failed in the step ${step}.`,
  /** A failed run that never entered a step, as a refused run's banner says it (HAL-11190). */
  didntStart: (workflow: string) => `${workflow} didn't start.`,
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
  webhook: "A web request arrived",
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
    webhook: "a web request",
    schedule: (when: string | undefined) =>
      when === undefined
        ? "the schedule"
        : `the schedule for ${when.charAt(0).toLowerCase()}${when.slice(1)}`,
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
  didntStart: "didn't start",
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

/** What joins the parts of a line: "Estimated cost €0.004". */
export const lineSeparator = " · ";

/** What the Runs list says in place of rows (mc 15.1; states R1 to R6, R10 and R17). */
export const emptyListWords = {
  noRunsTitle: "No runs yet",
  /**
   * The body is the parts around the command, which shows in code style (HAL-9369). With a
   * workflow it names one to run (HAL-10128); with none it points to Workflows; while the names
   * aren't known it keeps the sentence without a name.
   */
  noRunsBody: "Runs started from the command line show up here. To start one, type ",
  noRunsBodyEnd: " in a terminal.",
  noRunsNoWorkflow:
    "Runs started from the command line show up here. This workspace has no workflow yet: add one in Workflows.",
  /**
   * After the sentence in `pressRunWords` where a workflow's page has **Run** (HAL-12371). The
   * page's own sentence is right above, so the body doesn't say what a run is again.
   */
  noRunsFromCommandLine: "Runs started from the command line show up here too.",
  /** The body in the Acme sample, where a run starts from the Inbox, as Home's Recent runs says (HAL-12225). */
  noRunsSample: "Start one from the Inbox, and it shows up here.",
  onlyTestRuns: "Only test runs so far.",
  showTestRuns: "Show test runs",
  /** The Workflow chip's workflow has no run yet; the button clears the chip. */
  workflow: "No runs of this workflow yet.",
  showEveryWorkflow: "Show every workflow",
  /** A status chip with no runs; no button, since All is next to it (D13). */
  status: {
    live: "Nothing is running.",
    "needs-you": "Nothing is waiting for you.",
    failed: "No failed runs.",
  },
  loading: "Loading runs",
  loadFailed: "Couldn't load runs",
  /** Over the rows the list kept, when a later read failed for a reason that isn't the engine. */
  refreshFailed: "Couldn't refresh runs",
};

/** The Runs page's own words (checklist part 1, 1.2, 1.3 and R-D1). */
export const pageWords = {
  title: "Runs",
  sentence: "A run is one time a workflow or agent does its job.",
  filters: "Filters",
  status: "Status",
  statusChips: { all: "All", live: "Live", "needs-you": "Needs you", failed: "Failed" },
  testRuns: "Test runs",
  /** The Workflow chip, pressed while the list is of one workflow; pressing it clears it. */
  workflow: (name: string) => `Workflow: ${name}`,
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
  kindLabel: (workflow: string) => workflow,
  startedToday: (time: string) => `today ${time}`,
  startedYesterday: (time: string) => `yesterday ${time}`,
  took: (took: string) => `took ${took}`,
  updatesLive: "updates live",
  /** mc 15.2 Catch-up: the clock time for today, the date and the time for another day. */
  catchUpStarted: (when: { day?: string; time: string }) =>
    when.day === undefined
      ? `Started at ${when.time} to catch up.`
      : `Started on ${when.day} at ${when.time} to catch up.`,
  catchUpPlanned: (when: { day?: string; time: string }) =>
    when.day === undefined
      ? `It was planned for ${when.time} while Halonic was closed or asleep.`
      : `It was planned for ${when.day} at ${when.time} while Halonic was closed or asleep.`,
  catchUpSkipped: (count: number, isMinimum: boolean) => {
    if (isMinimum) {
      return `More than ${count.toLocaleString("en-US")} earlier times were skipped.`;
    }
    return count === 1
      ? "1 earlier time was skipped."
      : `${count.toLocaleString("en-US")} earlier times were skipped.`;
  },
  loading: (shortId: string) => `Loading run ${shortId}`,
  loadFailed: (shortId: string) => `Couldn't load run ${shortId}`,
  /** Over the run the page kept, when a later read failed for a reason that isn't the engine. */
  refreshFailed: (shortId: string) => `Couldn't refresh run ${shortId}`,
  /** The skeleton under the banner while the run's log is read (mc 15.2). */
  loadingLog: "Loading the run",
  logFailed: "Couldn't read this run's log",
  /** The red banner for a log with a damaged line; no "inside Halonic", as the cause may be a disk. */
  damagedLog: (line: number) =>
    `Part of this run's log can't be read. Line ${line} is damaged. Everything before it is shown, so the receipt may be incomplete.`,
  damagedLogName: "Damaged run log",
  notHere: "This run isn't in this workspace any more.",
  reviewInInbox: "Review in Inbox",
  runAgain: "Run again",
  runAgainFailedName: "Run didn't start",
  runAgainFailedTitle: "Couldn't start the run",
  runAgainFailed: (reason: string) => `Couldn't start the run: ${reason}`,
  openRun: (shortId: string) => `Open run ${shortId}`,
  waitingForYouName: "Waiting for you",
  waitingName: "Waiting",
  failedName: "Run failed",
  /**
   * The failed banner of a run the harness check refused (checklist S1, S2, S5 and S7 of the
   * instruction trust check). Calm words: nothing broke, a person hasn't said yes yet.
   */
  instructionsName: "Instructions not trusted",
  instructionsFirstTime: (agent: string) =>
    `${capitalised(agent)} didn't start. You haven't trusted its instructions yet.`,
  instructionsChanged: (agent: string) =>
    `${capitalised(agent)} didn't start. Its instructions changed since you trusted them.`,
  reviewInstructions: "Review instructions",
  instructionsOnComputer: "Trust these instructions on your computer first.",
  instructionsDeclined: "Nothing was trusted, so the run didn't start.",
  instructionsBusy: "A question about instructions is already open. Answer it first.",
  instructionsUnavailable: "Nothing was trusted. Try again.",
  instructionsTrusted: "Trusted. Run again to start it.",
  /** The failed banner of a run the sandbox check refused (microcopy 23.3): the agent's name, or the workflow's. */
  sandboxNotReady: (name: string) =>
    `${capitalised(name)} didn't start: the sandbox can't start on this computer.`,
  sandboxDocs: "Read the guide",
  /** Where the guide lives; the catalogue's docs key follows it. */
  sandboxDocsBase: "https://docs.halonic.dev",
  sandboxNothingRan: "Nothing ran.",
  sandboxCheckAgain: "Check again",
  /** Said once when a press finds it still refuses; the reason follows. */
  sandboxCheckedRefused: (reason: string) => `Sandbox checked: not ready. ${reason}`,
  /** Said, and shown, when a press of **Check again** finds the sandbox ready; **Run again** replaces the button. */
  sandboxReady: (name: string) => `The sandbox works now. You can run ${name}.`,
  sandboxCheckFailed: "Halonic couldn't check the sandbox. Try again.",
  budgetName: "Stopped at its budget",
  /** One tool approval (mc 15.2): who asks and what for, in the words of the Inbox card's title. */
  approval: (what: string, sends: boolean) =>
    `Waiting for your approval. ${what}. ${sends ? "Nothing is sent" : "It doesn't run"} until you decide.`,
  approvals: (count: number, what: string) =>
    `Waiting for ${count} approvals. ${what}, and ${count - 1} more. Nothing runs until you decide.`,
  /** What an agent asks to do: "Reporter wants to send an email with Gmail", else the Inbox card's "Sorter wants to use create_note". */
  approvalAsk: (agent: string, tool: string) =>
    `${capitalised(agent)} wants to ${toolAction(tool)}`,
  waitStep: (description: string) => `Waiting for you: ${description}`,
  waitStepNoDescription: (step: string) => `Waiting for you in the step ${step}.`,
  timer: (time: string) => `Waiting until ${time}.`,
  childRun: (shortId: string, workflow: string) =>
    `Waiting for child run ${shortId} (${workflow}).`,
  childRunOnly: (shortId: string) => `Waiting for child run ${shortId}.`,
  /** R24's general banner, for a cause Halonic doesn't know: the engine's message goes to Copy details only (F13). */
  failed: (workflow: string, step: string) =>
    `${workflow} failed in the step ${step}. Halonic can't tell the cause yet.`,
  budgetTitle: "Stopped at its estimated budget",
  budget: (workflow: string, step: string) => `${workflow} stopped in the step ${step}.`,
  /**
   * A budget stop's first line, as `halonic run` says it (cli-output 3.4, HAL-12035), from the
   * figures of `run.failed`'s cause. The amounts come in the money rule's words.
   */
  budgetPerRun: (workflow: string, step: string, budget: string, spent: string) =>
    `${workflow} stopped in the step ${step}: this run reached its budget of ${budget} (estimated ${spent} spent).`,
  budgetPerMonth: (workflow: string, step: string, budget: string) =>
    `${workflow} stopped in the step ${step}: this month's estimated spend reached its budget of ${budget}.`,
  /**
   * The second line, without the CLI's key names (Studio's users change the budget in Settings;
   * HAL-12069). A per-run budget doesn't reset, so only the monthly one can be waited out.
   */
  budgetChangePerRun: "Change the budget, then run again.",
  budgetChangeMonthly: (resetsOn: string) =>
    `Change the budget, or wait until it resets on ${resetsOn} (UTC).`,
  changeBudget: "Change budget",
  budgetChecks:
    "Halonic checks the budget before each model call, so calls already under way can take a run over it.",
  cancelledIn: (workflow: string, step: string) =>
    `${workflow} was cancelled in the step ${step}. Nothing after it ran.`,
  cancelledBeforeStart: (workflow: string) => `${workflow} was cancelled before it started.`,
};

/**
 * Every step's heading and each entry's line (checklist part 1, 1.10;
 * mc 15.2 and 19.3). The lines say what `halonic runs show` says after a
 * step's name (cli-output 3.4), as a sentence.
 */
export const everyStepWords = {
  heading: "Every step",
  /** The word a screen reader hears first for an entry (mc 19.3). */
  state: {
    done: "done",
    failed: "failed",
    cancelled: "cancelled",
    stopped: "stopped",
    needsYou: "waiting for you",
    waiting: "waiting",
    running: "running",
  },
  /** A screen reader's name for the row under a step that was refused sites (mc 23.2, 19.3). */
  blockedIn: (sites: number, step: string) =>
    `Blocked ${sites} ${sites === 1 ? "site" : "sites"}, in the step ${step}`,
  took: (took: string) => `Took ${took}`,
  failed: (took: string) => `Failed after ${took}`,
  /** mc 15.2 revision 70, "Cancelled, the step's timeline line". */
  cancelled: "Cancelled in this step",
  budget: (took: string) => `Budget reached after ${took}`,
  /** The user's answer at a wait step; "approve" and "reject" read as verbs, any other event as written. */
  answered: (event: string, time: string) => {
    if (event === "approve") return `You approved at ${time}`;
    if (event === "reject") return `You rejected at ${time}`;
    return `You answered ${event} at ${time}`;
  },
  waitingForYou: "Waiting for you",
  waitingForApproval: "Waiting for your approval",
  waitingUntil: (time: string) => `Waiting until ${time}`,
  waitingForChildRun: (shortId: string) => `Waiting for child run ${shortId}`,
  running: "Running",
};

/**
 * The parts of a step that ran branches or for-each items, under its entry (checklist part 1,
 * 1.10: "grouped under their step by branch name", "Item 2 of 5"). A team decision under
 * HAL-2282 (HAL-1301): microcopy has no words for them, so they use the entry's lines.
 */
export const stepGroupWords = {
  /** The row's title for one for-each item; the total is known only once the step has finished. */
  item: (number: number, total: number | undefined) =>
    total === undefined ? `Item ${number}` : `Item ${number} of ${total}`,
  /** What a screen reader hears before a branch's name. */
  branch: (name: string) => `Branch ${name}`,
  /** Names the step a branch or item belongs to, in its screen-reader label. */
  inStep: (name: string) => `in the step ${name}`,
  /** A part the step ended without, because the step failed or was stopped first. */
  unfinished: "Didn't finish",
};

/** Show the run log (checklist part 1, 1.10; mc 1.2 and 3.D W-D3). */
export const runLogWords = {
  show: "Show the run log",
  /** Team decision (HAL-2282): the same button, back to the timeline. */
  hide: "Show every step",
  /** The numbered list's name for screen readers. */
  label: "Run log",
};

/**
 * An entry's events in the side panel (checklist part 1, 1.10). The token line and "cached, no
 * model call" are the receipt's (kit 24.2); the headings, Close and the empty line are a team
 * decision under HAL-2282 (HAL-1301).
 */
export const stepEventsWords = {
  modelCalls: "Model calls",
  toolCalls: "Tool calls",
  tokens: (input: number, output: number) =>
    `${input.toLocaleString("en")} in · ${output.toLocaleString("en")} out`,
  cached: "cached, no model call",
  none: "This step made no model or tool calls.",
  close: (step: string) => `Close ${step}`,
  /** Before the child run's link: "Started Verify → Run 7k2m9p" (checklist 1.10, RUNS 3). */
  startedChild: (workflow: string) => `Started ${workflow}`,
};

/**
 * How a step is named (cli-output 3.4): the first line of its description,
 * trimmed, else its id with only the first letter made a capital. A hidden
 * character in the description is written as an escape, since a description
 * can be filled in from model output.
 */
export function stepName(stateId: string, description: string | undefined): string {
  const firstLine = description?.split("\n")[0]?.trim() ?? "";
  if (firstLine !== "") {
    return escapeHidden(firstLine);
  }
  return stateId.charAt(0).toUpperCase() + stateId.slice(1);
}

/** Details, the run page's right column (checklist part 1, 1.11; mc 15.2). */
export const detailsWords = {
  heading: "Details",
  startedBy: "Started by",
  started: "Started",
  took: "Took",
  modelCalls: "Model calls and tokens",
  estimatedCost: "Estimated cost",
  ranOn: "Ran on",
  /** The model calls row of a run that made none. */
  noModelCalls: "None",
  tokens: (input: string, output: string) => `${input} in · ${output} out`,
};

/**
 * The receipt's summary line (checklist part 1, 1.9; mc 15.2): the parts the
 * CLI's receipt says, in its words. "Running in" is a team decision under
 * HAL-2282 (HAL-1301): microcopy words the finished, waiting, failed, budget
 * and cancelled forms only.
 */
export const summaryWords = {
  runningIn: (step: string) => `Running in ${step}`,
  failedIn: (step: string, took: string) => `Failed in ${step} after ${took}`,
  /** A failed run that never entered a step (HAL-11190). */
  failedAfter: (took: string) => `Failed after ${took}`,
  /** A run waiting for the user: the banner says for what, so the line says since when. */
  waitingForYou: (since: string) => `Waiting for you${lineSeparator}started ${since}`,
  askedYou: (times: string) => `asked you ${times}`,
  soFar: (phrase: string) => `${phrase} so far`,
  counted: (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`,
};

/** Tools whose action has plain words; any other is "use" and its name, as the Inbox card says. */
const plainToolActions: Readonly<Record<string, string>> = {
  gmail_send: "send an email with Gmail",
};

/** "send an email with Gmail", or "use create_note" for a tool without plain words. */
export function toolAction(tool: string): string {
  return plainToolActions[tool] ?? `use ${tool}`;
}

export function capitalised(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** The receipt's heading: kit 24.2 gives it an `h2`; the word is a team decision under HAL-2282 (HAL-1301). */
export const receiptWords = {
  heading: "Receipt",
  approvalsHeading: "Approvals",
  messagesHeading: "Messages",
  readHeading: "Read",
  /** The Messages section's two lines (RCPT-2.2), one for drafts and one for sends. */
  drafted: (things: string) => `Drafted ${things}`,
  sent: (things: string) => `Sent ${things}`,
  modelsHeading: "Models and cost",
  /** One model's line (RCPT-2.5): calls, tokens, then what they cost. */
  modelCalls: (model: string, calls: number) =>
    `${model} · ${calls === 1 ? "1 call" : `${calls} calls`}`,
  modelTokens: (input: number, output: number) =>
    `${input.toLocaleString("en")} in · ${output.toLocaleString("en")} out`,
  modelCached: "cached, no model call",
  /** A mix of cached and fresh calls: "2 cached calls". */
  modelCachedCalls: (calls: number) => `${calls} cached ${calls === 1 ? "call" : "calls"}`,
  /** A call priced 0: never an amount (mc 15.2). */
  modelTestNoCost: "built-in test model, no cost",
  modelNoCost: "no cost",
  modelNoPrice: "No price",
  modelSubscription: "on your subscription",
  /** The total under the model lines; `calls` is the calls without a price. */
  modelsTotal: (amount: string, calls: number) =>
    `Estimated cost ${amount}${calls === 0 ? "" : ` + ${calls === 1 ? "1 call" : `${calls} calls`} without a price`} · from the prices in workspace settings › Models`,
  modelsTotalUnpriced: (calls: number) =>
    `${calls === 1 ? "1 call" : `${calls} calls`} without a price · from the prices in workspace settings › Models`,
  /** The Read section's one line (RCPT-2.7). */
  read: (things: string) => `Read ${things}`,
  /** One approval the run asked for: what was decided, by whom (RCPT-2.4), and when. */
  approvalLine: (action: string, decision: "approved" | "rejected", by: string, time: string) =>
    `${capitalised(action)}: ${decision}${by === "" ? "" : ` by ${by}`} at ${time}`,
  approvalWaiting: (action: string) => `${capitalised(action)}: waiting for your answer`,
  /** An approval left open when the run ended: nobody can answer it any more. */
  approvalNotAnswered: (action: string) => `${capitalised(action)}: not answered`,
  approvalByPerson: "you",
  approvalByRule: "a rule",
};
