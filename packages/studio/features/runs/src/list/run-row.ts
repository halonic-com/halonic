// One run as a row of the Runs list shows it (checklist part 1, 1.2; mc 9.7
// Row line, 15.2 Status chips): its chip, its short id, what ran, and the
// line under it. The line says what the What column of `halonic runs` says.

import {
  moneyAmount,
  type RunStanding,
  type RunWait,
  runStanding,
  runWait,
  shortRunId,
} from "@halonicjs/app";
import type { RunSummary } from "@halonicjs/events";
import type { StatusChipTone } from "@halonicjs/studio-kit";
import type { RunWorkflow, SourcedRun } from "../api.ts";
import { chipWords, costWords, lineSeparator, rowLineWords } from "../run-words.ts";
import { dueWords, tookWords } from "../time-words.ts";

/** A run's status chip: the same word everywhere, and a dot only while the run is live. */
export interface RunChip {
  readonly word: string;
  readonly tone: StatusChipTone;
  readonly dot: boolean;
}

/** One row of the Runs list. */
export interface RunRow {
  /** The run's full id, which opens its page. */
  readonly id: string;
  /** The last 6 characters of the id, as stored: the Run column, in the monospace style. */
  readonly shortId: string;
  readonly standing: RunStanding;
  readonly chip: RunChip;
  /** What ran: the workflow's name, or its id when it's no longer in the workspace. */
  readonly workflow: string;
  /** The line under What ran; never empty. */
  readonly line: string;
  /** A test case's run, which carries the outline Test tag. */
  readonly test: boolean;
}

/** What a row needs besides the run: its workflow, the workspace's currency and the time now. */
export interface RowContext {
  readonly workflow: RunWorkflow | undefined;
  /** The workspace's `budget.currency`. */
  readonly currency: string;
  readonly now: Date;
}

const chipLooks: Readonly<Record<RunStanding, Omit<RunChip, "word">>> = {
  running: { tone: "running", dot: true },
  "needs-you": { tone: "warning", dot: true },
  waiting: { tone: "neutral", dot: false },
  done: { tone: "success", dot: false },
  failed: { tone: "danger", dot: false },
  budget: { tone: "warning", dot: false },
  cancelled: { tone: "neutral", dot: false },
  "cant-try": { tone: "neutral", dot: false },
};

/**
 * The row of one run.
 *
 * @example
 * runRow({ summary, madeToolCalls: false }, { workflow, currency: "EUR", now: new Date() });
 * // { shortId: "01jd8q", chip: { word: "Done", … }, line: "Sent nothing · estimated cost €0.004", … }
 */
export function runRow(run: SourcedRun, context: RowContext): RunRow {
  const { summary } = run;
  const standing = runStanding(summary);
  return {
    id: summary.id,
    shortId: shortRunId(summary.id),
    standing,
    chip: { word: chipWords[standing], ...chipLooks[standing] },
    workflow: context.workflow?.name ?? summary.workflowId,
    line: rowLine(run, standing, context),
    test: summary.kind === "test",
  };
}

function rowLine(run: SourcedRun, standing: RunStanding, context: RowContext): string {
  const { summary } = run;
  const step = currentStepName(summary, context.workflow);
  switch (standing) {
    case "running":
    case "cant-try":
      return rowLineWords.inStep(step);
    case "needs-you":
      return needsYouLine(runWait(summary), step);
    case "waiting":
      return waitingLine(runWait(summary), step, context.now);
    case "done":
      return doneLine(run, step, context.currency);
    case "failed":
      return rowLineWords.failedIn(context.workflow?.name ?? summary.workflowId, step);
    case "budget":
      return withCost(rowLineWords.budgetReached(step, took(summary)), summary, context.currency);
    case "cancelled":
      return withCost(rowLineWords.cancelledIn(step, took(summary)), summary, context.currency);
  }
}

/** A tool approval, several approvals, or a wait step by its description. */
function needsYouLine(wait: RunWait, step: string): string {
  if (wait.kind === "approvals") {
    return wait.count === 1
      ? rowLineWords.waitingForApproval(step)
      : rowLineWords.waitingForApprovals(wait.count);
  }
  if (wait.kind === "step" && wait.title !== null) {
    return rowLineWords.waitingForYou(wait.title);
  }
  return rowLineWords.waitingInStep(step);
}

/** A wait that isn't the user's: a child run or a timer. */
function waitingLine(wait: RunWait, step: string, now: Date): string {
  if (wait.kind === "child-run") {
    return rowLineWords.waitingForChildRun(shortRunId(wait.runId));
  }
  if (wait.kind === "timer") {
    return rowLineWords.waitingUntil(dueWords(new Date(wait.at), now));
  }
  return rowLineWords.waitingIn(step);
}

/**
 * A finished run, never an empty line: "Sent nothing" only for a run without
 * a tool call, since the log doesn't record what a tool sent yet; then the
 * cost. With neither, the step it finished in.
 */
function doneLine(run: SourcedRun, step: string, currency: string): string {
  const parts = [
    ...(run.madeToolCalls ? [] : [rowLineWords.sentNothing]),
    ...costParts(run.summary, currency),
  ];
  const line = parts.join(lineSeparator);
  if (line === "") {
    return rowLineWords.finishedIn(step);
  }
  return line.charAt(0).toUpperCase() + line.slice(1);
}

function withCost(first: string, summary: RunSummary, currency: string): string {
  return [first, ...costParts(summary, currency)].join(lineSeparator);
}

/**
 * The cost part (mc 15.2, W1): the estimated cost, with the calls that had no
 * price after it; only those calls when none had a price; nothing at all for
 * a run on the test model, a local model or a subscription, never "€0.00".
 */
function costParts(summary: RunSummary, currency: string): string[] {
  if (summary.cost > 0) {
    const estimated = costWords.estimated(moneyAmount(summary.cost, currency));
    return summary.unpricedCalls > 0
      ? [`${estimated} ${costWords.plusWithoutPrice(summary.unpricedCalls)}`]
      : [estimated];
  }
  return summary.unpricedCalls > 0 ? [costWords.withoutPrice(summary.unpricedCalls)] : [];
}

function took(summary: RunSummary): string {
  const ended = summary.endedAt ?? summary.updatedAt;
  return tookWords(Date.parse(ended) - Date.parse(summary.startedAt));
}

/**
 * The step the run is in or stopped in: the step whose agent asked for an
 * approval, else the current step, else the last one it visited.
 */
function currentStepName(summary: RunSummary, workflow: RunWorkflow | undefined): string {
  const stateId =
    summary.approvals[0]?.state ?? summary.state ?? summary.statesVisited.at(-1) ?? "";
  return stepName(stateId, workflow?.stepDescription(stateId));
}

/**
 * How a step is named (cli-output 3.4): the first line of its description,
 * trimmed, else its id with only the first letter made a capital.
 */
function stepName(stateId: string, description: string | undefined): string {
  const firstLine = description?.split("\n")[0]?.trim() ?? "";
  if (firstLine !== "") {
    return firstLine;
  }
  return stateId.charAt(0).toUpperCase() + stateId.slice(1);
}
