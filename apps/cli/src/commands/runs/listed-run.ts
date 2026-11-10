// One row of the `halonic runs` list, worked out from a run's summary
// (cli-output 3.4, "the list"). Only the facts are decided here: which status
// word, which sentence for the What column, and when the run started. The
// words themselves come from `runsListMessages`, so this file holds no text.

import { shortRunId, type WorkflowDefinition } from "@halonicjs/app";
import type { RunSummary } from "@halonicjs/events";
import { duration } from "../../messages/duration.ts";
import { money } from "../../messages/money.ts";
import type { Phrase } from "../../messages/phrase.ts";
import { type ListedStatus, runsListMessages } from "../../messages/runs-list.ts";
import { stepName } from "../../messages/step-name.ts";
import { printable } from "../../output/printable.ts";
import { dueAt, type RunClock, startedAt } from "../../run-times.ts";

/**
 * Finds a run's workflow in the workspace, by its hub and id. `undefined`
 * when the workflow is gone: the row then names it by its id.
 */
export type FindWorkflow = (hubId: string, workflowId: string) => WorkflowDefinition | undefined;

/** What the list reads to show one run. */
export interface RunToList {
  readonly summary: RunSummary;
  /**
   * Whether the run's log has a tool call, as `sendsOf` in `@halonicjs/events`
   * works it out. The summary doesn't say, and a run "sent nothing" only when
   * it made none (cli-output 3.4, revision 32).
   */
  readonly madeToolCalls: boolean;
}

/** One run, as its row in the list shows it. */
export interface ListedRun {
  readonly status: ListedStatus;
  /** The short id, as Studio shows it and `runs show` takes it back. */
  readonly runId: string;
  /** The workflow's title, or its id when it's no longer in the workspace. */
  readonly workflow: string;
  /** One short sentence by status; never empty. */
  readonly what: Phrase;
  readonly when: Phrase;
}

/**
 * The row of one run.
 *
 * @example
 * listedRun({ summary, madeToolCalls: true }, findWorkflow, { now: new Date() });
 * // { status: "done", runId: "01jd8q", workflow: "Support reply", what: […"Estimated cost €0.004"], when: […"10:31 · took 18 s"] }
 */
export function listedRun(run: RunToList, findWorkflow: FindWorkflow, clock: RunClock): ListedRun {
  const { summary } = run;
  const workflow = findWorkflow(summary.hubId, summary.workflowId);
  return {
    status: listedStatus(summary),
    runId: shortRunId(summary.id),
    workflow: workflowTitle(workflow, summary),
    what: whatColumn(run, workflow, clock),
    when: whenColumn(summary, clock),
  };
}

/**
 * How the list and `runs show` name a run's workflow: its title, or its id
 * when it's no longer in the workspace. Both come from workspace files, so
 * the name is made printable (cli-output section 5).
 */
export function workflowTitle(
  workflow: WorkflowDefinition | undefined,
  summary: RunSummary,
): string {
  return printable(workflow?.name ?? summary.workflowId);
}

/**
 * Studio's status word for a run: a waiting run needs the user unless it
 * waits for a time or a child run, and a failed run that kept to its budget
 * or was cancelled is Stopped.
 */
export function listedStatus(summary: RunSummary): ListedStatus {
  switch (summary.status) {
    case "running":
      return "running";
    case "waiting":
      return waitsForTheUser(summary) ? "needsYou" : "waiting";
    case "completed":
      return "done";
    case "failed":
      return isStopped(summary) ? "stopped" : "failed";
  }
}

/**
 * Whether a waiting run waits for the user, decided in this order
 * (cli-output 3.4, revision 31, M6): a pending tool approval needs the user;
 * a run with `waitingOn` waits for its child run; a step that accepts events
 * needs the user. Anything else waits for a time, or just waits.
 */
function waitsForTheUser(summary: RunSummary): boolean {
  if (summary.approvals.length > 0) {
    return true;
  }
  return summary.waitingOn === null && summary.accepts.length > 0;
}

/** A ◌ Waiting run: for its child run, until its timer, or else in its step. */
function waitingWhat(summary: RunSummary, step: string, clock: RunClock): Phrase {
  if (summary.waitingOn !== null) {
    return runsListMessages.waitingForChildRun(shortRunId(summary.waitingOn)).phrase;
  }
  if (summary.nextTimer !== null) {
    return runsListMessages.waitingUntil(dueAt(new Date(summary.nextTimer), clock)).phrase;
  }
  return runsListMessages.waitingIn(step).phrase;
}

function isStopped(summary: RunSummary): boolean {
  return summary.reason === "budget" || summary.reason === "cancelled";
}

function whatColumn(
  run: RunToList,
  workflow: WorkflowDefinition | undefined,
  clock: RunClock,
): Phrase {
  const { summary } = run;
  const step = currentStepName(summary, workflow);
  switch (listedStatus(summary)) {
    case "running":
    case "failed":
      return runsListMessages.inStep(step).phrase;
    case "needsYou":
      return needsYouWhat(summary, workflow, step);
    case "waiting":
      return waitingWhat(summary, step, clock);
    case "done":
      return doneWhat(run, step);
    case "stopped":
      return summary.reason === "budget"
        ? runsListMessages.budgetReached(step).phrase
        : runsListMessages.cancelledIn(step).phrase;
  }
}

/**
 * A completed run, never an empty column (cli-output 3.4, revision 32). The
 * log doesn't record what a tool sent yet, so "Sent nothing" only for a run
 * without a tool call. Otherwise its estimated cost, or for a run that had
 * no priced call (a subscription), the step it finished in.
 */
function doneWhat(run: RunToList, step: string): Phrase {
  const cost = run.summary.cost > 0 ? money(run.summary.cost) : undefined;
  if (!run.madeToolCalls) {
    return runsListMessages.sentNothing(cost).phrase;
  }
  return cost === undefined
    ? runsListMessages.finishedIn(step).phrase
    : runsListMessages.estimatedCost(cost).phrase;
}

/**
 * A run that needs the user: for a tool approval, the step whose agent
 * asked; at a wait step, the waiting line's own words, or the step when it
 * has no description.
 */
function needsYouWhat(
  summary: RunSummary,
  workflow: WorkflowDefinition | undefined,
  step: string,
): Phrase {
  if (summary.approvals.length > 0) {
    return runsListMessages.waitingForApproval(step).phrase;
  }
  const description = waitDescription(summary, workflow);
  return description === undefined
    ? runsListMessages.waitingInStep(step).phrase
    : runsListMessages.waitingForYou(description).phrase;
}

/** The first line of the wait step's description, as written; `undefined` when it has none. */
export function waitDescription(
  summary: RunSummary,
  workflow: WorkflowDefinition | undefined,
): string | undefined {
  const description =
    summary.state === null ? undefined : workflow?.states[summary.state]?.description;
  const firstLine = description?.split("\n")[0]?.trim();
  return firstLine === "" ? undefined : firstLine;
}

/**
 * The step the run is in or stopped in, named as everywhere in 3.4. A
 * failed run has no current step, so it is the last one it visited; an
 * approval names the step whose agent asked.
 */
function currentStepName(summary: RunSummary, workflow: WorkflowDefinition | undefined): string {
  const stateId =
    summary.approvals[0]?.state ??
    summary.state ??
    summary.statesVisited.at(-1) ??
    workflow?.initial ??
    "";
  return stepName(stateId, workflow?.states[stateId]?.description);
}

function whenColumn(summary: RunSummary, clock: RunClock): Phrase {
  const started = startedAt(new Date(summary.startedAt), clock);
  if (summary.endedAt === null) {
    return runsListMessages.when(started).phrase;
  }
  const took = Date.parse(summary.endedAt) - Date.parse(summary.startedAt);
  return runsListMessages.when(started, duration(took)).phrase;
}
