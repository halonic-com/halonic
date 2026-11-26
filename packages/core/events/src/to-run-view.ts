import type { RunEvent } from "./run-event.ts";
import { continueEvent } from "./run-limit-waiting.ts";
import type { PendingApproval, RunSummary } from "./run-summary.ts";
import type {
  AnswerHandle,
  RunView,
  RunViewAsk,
  RunViewMarks,
  RunViewWaitsFor,
  WaitingPoint,
} from "./run-view.ts";
import { toRunViewEvents } from "./run-view-events.ts";
import { runViewFailureOf } from "./run-view-failure.ts";
import { runViewWords } from "./run-view-words.ts";
import { summarize } from "./summarize.ts";

/** The longest run title, cut from the end user's first message. */
export const maxRunViewTitleLength = 80;

/** The longest value one `{name}` placeholder of an approval text is filled with; a longer one is cut. */
export const maxApprovalArgumentLength = 200;

/** The longest chat message an end user may send with a `message` handle. */
export const maxAnswerMessageLength = 20_000;

/**
 * Gives the handle for a waiting point. The deployment makes it, keeps what it stands for with
 * the run's scope, and gives the same handle for the same point until it is used.
 */
export type HandleOf = (point: WaitingPoint) => string;

/**
 * A run as an end user sees it (requirement `events.run-view`): built from its events, the
 * workflow's user-facing marks and the deployment's handles, copying allowed fields one by one.
 * `null` for a log that doesn't start with `run.started`.
 */
export function toRunView(
  events: readonly RunEvent[],
  marks: RunViewMarks,
  handleOf: HandleOf,
): RunView | null {
  const summary = summarize(events);
  if (summary === null) return null;
  const viewEvents = toRunViewEvents(events, marks);
  const messages = viewEvents.flatMap((event) =>
    event.kind === "message" ? [{ from: event.from, text: event.text, at: event.at }] : [],
  );
  const firstOwn = messages.find((message) => message.from === "you");
  const waiting = waitingOf(summary, events);
  const asks = asksOf(waiting, marks, handleOf);
  const message = messageHandleOf(waiting, marks, handleOf);
  return {
    id: summary.id,
    name: marks.displayName,
    status: summary.status,
    startedAt: summary.startedAt,
    endedAt: summary.endedAt,
    title: firstOwn === undefined ? null : titleOf(firstOwn.text),
    messages,
    results: resultsOf(summary, marks),
    files: viewEvents.flatMap((event) => (event.kind === "file" ? [event.file] : [])),
    waitsFor: waitsForOf(summary, asks.length > 0, message !== null),
    asks,
    message,
    nextTimer: summary.status === "waiting" ? summary.nextTimer : null,
    limit: summary.status === "waiting" ? (summary.limit?.code ?? null) : null,
    usage: { inputTokens: summary.usage.inputTokens, outputTokens: summary.usage.outputTokens },
    cost: summary.cost,
    failure: summary.status === "failed" ? runViewFailureOf(summary.reason, summary.cause) : null,
  };
}

/**
 * The points a run waits at for an end user, in the order `toRunView` asks for their handles.
 * The deployment reads them first, makes or finds each one's stored handle, then builds the
 * view with a lookup of those handles, since storing a handle can't happen inside `toRunView`.
 */
export function waitingPointsOf(events: readonly RunEvent[], marks: RunViewMarks): WaitingPoint[] {
  const points: WaitingPoint[] = [];
  toRunView(events, marks, (point) => {
    points.push(point);
    return "";
  });
  return points;
}

function titleOf(text: string): string {
  const firstLine = text.split("\n")[0] ?? "";
  return firstLine.trim().slice(0, maxRunViewTitleLength);
}

function resultsOf(summary: RunSummary, marks: RunViewMarks): Record<string, unknown> {
  const results: Record<string, unknown> = {};
  for (const key of marks.results) {
    if (Object.hasOwn(summary.context, key)) results[key] = summary.context[key];
  }
  return results;
}

/**
 * A waiting run's summary and the state of the step it waits at, from its last `run.waiting` or
 * `run.limit-waiting`.
 */
interface Waiting {
  readonly summary: RunSummary;
  readonly state: string;
}

/** The run's wait, or `null` while it isn't waiting at a step (`summarize` keeps no wait state). */
function waitingOf(summary: RunSummary, events: readonly RunEvent[]): Waiting | null {
  if (summary.status !== "waiting") return null;
  const lastWait = events.findLast(
    (event) => event.type === "run.waiting" || event.type === "run.limit-waiting",
  );
  if (lastWait?.type !== "run.waiting" && lastWait?.type !== "run.limit-waiting") return null;
  return lastWait.state === null ? null : { summary, state: lastWait.state };
}

function waitsForOf(summary: RunSummary, asks: boolean, message: boolean): RunViewWaitsFor {
  if (summary.status !== "waiting") return null;
  // A plan limit's continue is an ask too, but the run waits for the plan, not for a decision.
  if (summary.limit !== undefined) return "limit";
  if (asks) return "you";
  if (message) return "message";
  if (summary.nextTimer !== null) return "timer";
  return null;
}

/** The approvals waiting for the end user, then the wait step's question when there is one. */
function asksOf(waiting: Waiting | null, marks: RunViewMarks, handleOf: HandleOf): RunViewAsk[] {
  if (waiting === null) return [];
  const { summary } = waiting;
  if (summary.limit !== undefined) return [continueAsk(waiting, handleOf)];
  const asks = summary.approvals.map((approval) => approvalAsk(approval, marks, handleOf));
  // An approval has its own answers, not the wait step's events.
  if (asks.length > 0) return asks;
  const labelled = summary.accepts.filter(
    (event) => event !== marks.messageEvent && Object.hasOwn(summary.answerLabels, event),
  );
  if (labelled.length === 0) return asks;
  const point: WaitingPoint = { kind: "question", state: waiting.state, events: labelled };
  const choices = labelled.map((event) => summary.answerLabels[event] ?? "");
  const answer: AnswerHandle = {
    handle: handleOf(point),
    kind: "question",
    payloadSchema: { type: "choice", choices },
  };
  const title = summary.waitingFor?.title ?? runViewWords.question;
  return [{ answer, title, body: summary.waitingFor?.body ?? "" }];
}

/** The one answer a run waiting at a plan limit takes: continue, which the engine decides again. */
function continueAsk(waiting: Waiting, handleOf: HandleOf): RunViewAsk {
  const point: WaitingPoint = { kind: "question", state: waiting.state, events: [continueEvent] };
  const answer: AnswerHandle = {
    handle: handleOf(point),
    kind: "question",
    payloadSchema: { type: "choice", choices: [runViewWords.continue] },
  };
  return { answer, title: runViewWords.limitWaiting, body: "" };
}

function approvalAsk(
  approval: PendingApproval,
  marks: RunViewMarks,
  handleOf: HandleOf,
): RunViewAsk {
  const answer: AnswerHandle = {
    handle: handleOf({ kind: "approval", callId: approval.callId }),
    kind: "approval",
    payloadSchema: { type: "approve-or-reject" },
  };
  return { answer, title: approvalTextOf(approval, marks), body: "" };
}

/**
 * The seller's approval text for a tool call, with `{name}` filled in from that argument when
 * it is a plain value, cut at {@link maxApprovalArgumentLength} characters. Without such text, the fixed line, never the tool or its arguments.
 */
export function approvalTextOf(approval: PendingApproval, marks: RunViewMarks): string {
  const key =
    approval.connector === undefined ? approval.tool : `${approval.connector}/${approval.tool}`;
  const text = marks.approvalTexts[key];
  if (text === undefined) return runViewWords.approval;
  return text.replace(/\{([A-Za-z0-9_]+)\}/g, (placeholder, name: string) => {
    const value = argumentOf(approval.args, name);
    return value ?? placeholder;
  });
}

function argumentOf(args: unknown, name: string): string | null {
  if (typeof args !== "object" || args === null || !Object.hasOwn(args, name)) return null;
  const value: unknown = (args as Record<string, unknown>)[name];
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value).slice(0, maxApprovalArgumentLength);
  }
  return null;
}

function messageHandleOf(
  waiting: Waiting | null,
  marks: RunViewMarks,
  handleOf: HandleOf,
): AnswerHandle | null {
  const event = marks.messageEvent;
  if (waiting === null || event === undefined) return null;
  if (!waiting.summary.accepts.includes(event)) return null;
  return {
    handle: handleOf({ kind: "message", state: waiting.state, event }),
    kind: "message",
    payloadSchema: { type: "message", maxLength: maxAnswerMessageLength },
  };
}
