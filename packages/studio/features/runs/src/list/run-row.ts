// One run as a row of the Runs list shows it (checklist part 1, 1.2; mc 9.7
// Row line, 15.1, 15.2 Status chips, 19.3 Run row): its chip, its short id,
// what ran, the line under it, what started it, and when it started over how
// long it took. The line says what the What column of `halonic runs` says.

import {
  moneyAmount,
  type RunStanding,
  type RunWait,
  runStanding,
  runWait,
  shortRunId,
} from "@halonicjs/app";
import type { RunSummary } from "@halonicjs/events";
import { escapeHidden } from "@halonicjs/std";
import type { StatusChipTone } from "@halonicjs/studio-kit";
import type { RunRoutine, RunWorkflow, SourcedRun } from "../api.ts";
import {
  chipWords,
  costWords,
  lineSeparator,
  rowLabelWords,
  rowLineWords,
  startedByWords,
  stepName,
  whenWords,
} from "../run-words.ts";
import { clockTime, dueWords, tookWords } from "../time-words.ts";

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
  /** The hub the run's workflow is in; with `id` it names the run's item. */
  readonly hubId: string;
  /** The id of the run's workflow in its hub; with `hubId` it names the workflow. */
  readonly workflowId: string;
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
  /** The Started by column: "A message arrived", "Schedule · weekdays at 08:00". */
  readonly startedBy: string;
  /** The Started by column's tooltip: the routine's name, for a run its schedule started. */
  readonly startedByTooltip: string | undefined;
  /** When the run started, as the run log writes it; the list groups rows by its day. */
  readonly startedAt: string;
  /** The When column: the time the run started, "10:40"; its day is the group's heading. */
  readonly time: string;
  /** Under the time once the run has ended: "took 2 min". */
  readonly took: string | undefined;
  /** The sentence a screen reader hears for the row, in place of its columns (mc 19.3). */
  readonly label: string;
}

/**
 * What a row needs besides the run: its workflow, the routine that started
 * it, the workspace's currency and the time now.
 */
export interface RowContext {
  readonly workflow: RunWorkflow | undefined;
  /** The routine in the run's `trigger.routineId`; `undefined` without one, or when it's gone. */
  readonly routine: RunRoutine | undefined;
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
  budget: { tone: "attention", dot: false },
  cancelled: { tone: "neutral", dot: false },
  "cant-try": { tone: "neutral", dot: false },
};

/**
 * The row of one run.
 *
 * @example
 * runRow({ summary }, { workflow, routine: undefined, currency: "EUR", now: new Date() });
 * // { shortId: "01jd8q", chip: { word: "Done", … }, line: "Estimated cost €0.004", startedBy: "You, with Run", … }
 */
export function runRow(run: SourcedRun, context: RowContext): RunRow {
  const { summary } = run;
  const standing = runStanding(summary);
  const shortId = shortRunId(summary.id);
  const workflow = context.workflow?.name ?? summary.workflowId;
  const line = rowLine(run, standing, context);
  const test = summary.kind === "test";
  const time = clockTime(new Date(summary.startedAt));
  const started = startedBy(run, context.routine);
  const spoken =
    standing === "failed"
      ? failedSpoken(summary, context.workflow)
      : `${rowLabelWords.standing[standing]}, ${lowerFirst(line)}`;
  return {
    id: summary.id,
    hubId: summary.hubId,
    workflowId: summary.workflowId,
    shortId,
    standing,
    chip: { word: chipWords[standing], ...chipLooks[standing] },
    workflow,
    line,
    test,
    startedBy: started.words,
    startedByTooltip: started.tooltip,
    startedAt: summary.startedAt,
    time,
    took: summary.endedAt === null ? undefined : whenWords.took(took(summary)),
    label: rowLabelWords.row(shortId, workflow, spoken, started.spoken, time, test),
  };
}

/**
 * What started the run (mc 15.1): its test case, the run it's a child of, or
 * its trigger. A run without a trigger was started in the terminal. A
 * routine's run on a clock says the routine's schedule, with its name in the
 * tooltip. `spoken` is what the row's sentence says after "Started by".
 */
export function startedBy(
  run: SourcedRun,
  routine: RunRoutine | undefined,
): { readonly words: string; readonly spoken: string; readonly tooltip: string | undefined } {
  const { summary } = run;
  const spoken = rowLabelWords.startedBy;
  const words = (text: string, said: string) => ({ words: text, spoken: said, tooltip: undefined });
  if (summary.kind === "test") {
    return run.testCase === undefined
      ? words(startedByWords.testCase, spoken.testCase)
      : words(startedByWords.test(run.testCase), spoken.test(run.testCase));
  }
  if (summary.parentRunId !== null) {
    const parent = shortRunId(summary.parentRunId);
    return words(startedByWords.parent(parent), spoken.parent(parent));
  }
  const { trigger } = summary;
  switch (trigger?.type) {
    case undefined:
      return words(startedByWords.terminal, spoken.terminal);
    case "manual":
      return words(startedByWords.run, spoken.run);
    case "inbox":
      return words(startedByWords.inbox, spoken.inbox);
    case "mail":
      return words(startedByWords.mail, spoken.mail);
    case "signal":
      return words(startedByWords.signal, spoken.signal);
    case "webhook":
      return words(startedByWords.webhook, spoken.webhook);
    case "schedule":
    case "every": {
      const tooltip = routine?.name ?? trigger.routineId;
      return trigger.catchUp === undefined
        ? {
            words: startedByWords.schedule(routine?.schedule),
            spoken: spoken.schedule(routine?.schedule),
            tooltip,
          }
        : { words: startedByWords.catchUp, spoken: spoken.catchUp, tooltip };
    }
    default:
      // A run log from a newer Halonic can name a trigger this Studio doesn't know yet: the row
      // still shows, read as the person's own run rather than failing.
      return words(startedByWords.run, spoken.run);
  }
}

/** A failed run as the row's sentence says it: the step it failed in, or that it didn't start. */
function failedSpoken(summary: RunSummary, workflow: RunWorkflow | undefined): string {
  return enteredAStep(summary)
    ? rowLabelWords.failedIn(currentStepName(summary, workflow))
    : rowLabelWords.didntStart;
}

function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
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
      return doneLine(run, context.currency);
    case "failed": {
      const workflow = context.workflow?.name ?? summary.workflowId;
      return enteredAStep(summary)
        ? rowLineWords.failedIn(workflow, step)
        : rowLineWords.didntStart(workflow);
    }
    case "budget":
      return withCost(rowLineWords.budgetReached(step, took(summary)), summary, context.currency);
    case "cancelled":
      return withCost(rowLineWords.cancelledIn(step, took(summary)), summary, context.currency);
  }
}

/** A tool approval, several approvals, or a wait step by its description. */
export function needsYouLine(wait: RunWait, step: string): string {
  if (wait.kind === "approvals") {
    return wait.count === 1
      ? rowLineWords.waitingForApproval(step)
      : rowLineWords.waitingForApprovals(wait.count);
  }
  if (wait.kind === "step" && wait.title !== null) {
    return rowLineWords.waitingForYou(escapeHidden(wait.title));
  }
  return rowLineWords.waitingInStep(step);
}

/** A wait that isn't the user's: a child run or a timer. */
export function waitingLine(wait: RunWait, step: string, now: Date): string {
  if (wait.kind === "child-run") {
    return rowLineWords.waitingForChildRun(shortRunId(wait.runId));
  }
  if (wait.kind === "timer") {
    return rowLineWords.waitingUntil(dueWords(new Date(wait.at), now));
  }
  return rowLineWords.waitingIn(step);
}

/**
 * A finished run, never an empty line: its cost, or with no cost just "Finished". A run without a tool call has no sent part, never "Sent".
 */
function doneLine(run: SourcedRun, currency: string): string {
  const line = costParts(run.summary, currency).join(lineSeparator);
  if (line === "") {
    return rowLineWords.finished;
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
export function costParts(summary: RunSummary, currency: string): string[] {
  if (summary.cost > 0) {
    const estimated = costWords.estimated(moneyAmount(summary.cost, currency));
    return summary.unpricedCalls > 0
      ? [`${estimated} ${costWords.plusWithoutPrice(summary.unpricedCalls)}`]
      : [estimated];
  }
  return summary.unpricedCalls > 0 ? [costWords.withoutPrice(summary.unpricedCalls)] : [];
}

export function took(summary: RunSummary): string {
  const ended = summary.endedAt ?? summary.updatedAt;
  return tookWords(Date.parse(ended) - Date.parse(summary.startedAt));
}

/** Whether the run got as far as a step: a run the sandbox refused at its start has none. */
export function enteredAStep(summary: RunSummary): boolean {
  return summary.approvals.length > 0 || summary.state !== null || summary.statesVisited.length > 0;
}

/**
 * The step the run is in or stopped in: the step whose agent asked for an
 * approval, else the current step, else the last one it visited.
 */
export function currentStepName(summary: RunSummary, workflow: RunWorkflow | undefined): string {
  const stateId =
    summary.approvals[0]?.state ?? summary.state ?? summary.statesVisited.at(-1) ?? "";
  return stepName(stateId, workflow?.stepDescription(stateId));
}
