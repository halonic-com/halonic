// One row of the `halonic runs` list, worked out from a run's summary
// (cli-output 3.4, "the list"). Only the facts are decided here: which status
// word, which sentence for the What column, and when the run started. The
// words themselves come from `runsListMessages`, so this file holds no text.

import type { RunSummary } from "@halonicjs/events";
import type { KindValues } from "@halonicjs/format";
import { duration } from "../../messages/duration.ts";
import { money } from "../../messages/money.ts";
import type { Phrase } from "../../messages/phrase.ts";
import { type ListedStatus, runsListMessages, type StartedAt } from "../../messages/runs-list.ts";
import { stepName } from "../../messages/step-name.ts";

/** A workflow as the workspace defines it now. */
export type WorkflowDefinition = KindValues["workflow"];

/**
 * Finds a run's workflow in the workspace, by its hub and id. `undefined`
 * when the workflow is gone: the row then names it by its id.
 */
export type FindWorkflow = (hubId: string, workflowId: string) => WorkflowDefinition | undefined;

/** One run, as its row in the list shows it. */
export interface ListedRun {
  readonly status: ListedStatus;
  readonly runId: string;
  /** The workflow's title, or its id when it's no longer in the workspace. */
  readonly workflow: string;
  /** One short sentence by status; empty for a completed run with no priced call. */
  readonly what: Phrase;
  readonly when: Phrase;
}

/** The clock and time zone the When column is written in. */
export interface ListClock {
  /** The time the list is printed, so "today" and "yesterday" are right. */
  readonly now: Date;
  /** An IANA time zone such as "Europe/Amsterdam"; the computer's own by default. */
  readonly timeZone?: string;
}

/**
 * The row of one run.
 *
 * @example
 * listedRun(summary, findWorkflow, { now: new Date() });
 * // { status: "done", runId: "01JD8Q", workflow: "Support reply", what: […"Estimated cost €0.004"], when: […"10:31 · took 18 s"] }
 */
export function listedRun(
  summary: RunSummary,
  findWorkflow: FindWorkflow,
  clock: ListClock,
): ListedRun {
  const workflow = findWorkflow(summary.hubId, summary.workflowId);
  return {
    status: listedStatus(summary),
    runId: summary.id,
    workflow: workflow?.name ?? summary.workflowId,
    what: whatColumn(summary, workflow, clock),
    when: whenColumn(summary, clock),
  };
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
 * Whether a waiting run waits for the user: for a tool approval, or at a
 * wait step that accepts an event. A run whose step accepts no event waits
 * for a timer, and one with `waitingOn` for its child run.
 */
function waitsForTheUser(summary: RunSummary): boolean {
  if (summary.approvals.length > 0) {
    return true;
  }
  return summary.waitingOn === null && summary.accepts.length > 0;
}

function isStopped(summary: RunSummary): boolean {
  return summary.reason === "budget" || summary.reason === "cancelled";
}

function whatColumn(
  summary: RunSummary,
  workflow: WorkflowDefinition | undefined,
  clock: ListClock,
): Phrase {
  const step = currentStepName(summary, workflow);
  switch (listedStatus(summary)) {
    case "running":
    case "failed":
      return runsListMessages.inStep(step).phrase;
    case "needsYou":
      return needsYouWhat(summary, workflow, step);
    case "waiting":
      return summary.waitingOn === null
        ? runsListMessages.waitingUntil(clockTime(summary.nextTimer ?? summary.updatedAt, clock))
            .phrase
        : runsListMessages.waitingForRun(summary.waitingOn).phrase;
    case "done":
      return summary.cost > 0 ? runsListMessages.estimatedCost(money(summary.cost)).phrase : [];
    case "stopped":
      return summary.reason === "budget"
        ? runsListMessages.budgetReached(step).phrase
        : runsListMessages.cancelledIn(step).phrase;
  }
}

/**
 * A run that needs the user: at a wait step with a description, the waiting
 * line's own words; for a tool approval, or a wait step without one, the step.
 */
function needsYouWhat(
  summary: RunSummary,
  workflow: WorkflowDefinition | undefined,
  step: string,
): Phrase {
  const description =
    summary.approvals.length === 0 ? waitDescription(summary, workflow) : undefined;
  return description === undefined
    ? runsListMessages.waitingInStep(step).phrase
    : runsListMessages.waitingForYou(description).phrase;
}

/** The first line of the wait step's description, as written; `undefined` when it has none. */
function waitDescription(
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

function whenColumn(summary: RunSummary, clock: ListClock): Phrase {
  const started = startedAt(new Date(summary.startedAt), clock);
  if (summary.endedAt === null) {
    return runsListMessages.when(started).phrase;
  }
  const took = Date.parse(summary.endedAt) - Date.parse(summary.startedAt);
  return runsListMessages.when(started, duration(took)).phrase;
}

/**
 * When a run started, as the When column writes it: today's time, yesterday,
 * a day this year, or a day in an earlier year, all in the list's time zone.
 */
export function startedAt(start: Date, clock: ListClock): StartedAt {
  const day = calendarDay(start, clock.timeZone);
  const today = calendarDay(clock.now, clock.timeZone);
  const time = clockTime(start.toISOString(), clock);
  if (sameDay(day, today)) {
    return { day: "today", time };
  }
  const yesterday = calendarDay(new Date(clock.now.getTime() - dayInMs), clock.timeZone);
  if (sameDay(day, yesterday)) {
    return { day: "yesterday", time };
  }
  const date = { day: day.day, month: day.month };
  if (day.year === today.year) {
    return { day: "thisYear", date, time };
  }
  return { day: "earlier", date, year: day.year };
}

const dayInMs = 24 * 60 * 60 * 1000;

interface YearDay {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

function sameDay(a: YearDay, b: YearDay): boolean {
  return a.year === b.year && a.month === b.month && a.day === b.day;
}

function calendarDay(date: Date, timeZone: string | undefined): YearDay {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((each) => each.type === type)?.value);
  return { year: part("year"), month: part("month"), day: part("day") };
}

/** "10:31": hours and minutes on a 24-hour clock, in the list's time zone. */
function clockTime(iso: string, clock: ListClock): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: clock.timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(iso));
}
