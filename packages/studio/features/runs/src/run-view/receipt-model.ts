// The receipt's summary line (checklist part 1, 1.9; mc 15.2): what the run
// did in one wrapping line, the same parts, order and words as the CLI's
// receipt (cli-output 3.4): how it stands, what it sent, how often it asked
// the user, and its estimated cost.

import { moneyAmount, runStanding, runWait } from "@halonicjs/app";
import type {
  ApprovalResolver,
  RunEvent,
  RunSends,
  RunSummary,
  SendCount,
  SendGroup,
} from "@halonicjs/events";
import { draftsOf, readsOf, sendsOf } from "@halonicjs/events";
import { escapeHidden } from "@halonicjs/std";
import type { SourcedRun } from "../api.ts";
import { costParts, currentStepName, enteredAStep, took, waitingLine } from "../list/run-row.ts";
import { lineSeparator, rowLineWords, summaryWords, toolAction } from "../run-words.ts";
import { clockTime } from "../time-words.ts";
import { receiptWords } from "./receipt-words.ts";
import { type RunPageContext, startedWords } from "./run-page-model.ts";

/**
 * The summary line of a run's receipt, from its log. Live runs say "so far"
 * once, after the last thing they sent, and don't count the times they asked
 * the user: that is a receipt of a finished run. A run that waits for the user
 * says since when, never the banner's sentence again. A run on the test model or a local
 * model has no cost part, never "€0.00".
 *
 * @example
 * summaryLine(run, events, context);
 * // "Finished in 2 min · sent 2 emails and 2 invites · saved 1 Drive file · estimated cost €0.03"
 */
export function summaryLine(
  run: SourcedRun,
  events: readonly RunEvent[],
  context: RunPageContext,
): string {
  const { summary } = run;
  const standing = runStanding(summary);
  const step = currentStepName(summary, context.workflow);
  const live = standing === "running" || standing === "needs-you" || standing === "waiting";
  const sent = sendsInWords(sendsOf(events));
  const sentParts =
    live && sent.length > 0 ? [...sent.slice(0, -1), summaryWords.soFar(sent.at(-1) ?? "")] : sent;
  return [
    lead(standing, run, step, context),
    ...sentParts,
    ...(live ? [] : askedParts(events)),
    ...costParts(summary, context.currency),
  ].join(lineSeparator);
}

function lead(
  standing: ReturnType<typeof runStanding>,
  run: SourcedRun,
  step: string,
  context: RunPageContext,
): string {
  const { summary } = run;
  switch (standing) {
    case "running":
      return summaryWords.runningIn(step);
    case "cant-try":
      return rowLineWords.inStep(step);
    case "needs-you":
      // The banner above says what it waits for; this line only says since when.
      return summaryWords.waitingForYou(startedSince(new Date(summary.startedAt), context.now));
    case "waiting":
      return waitingLine(runWait(summary), step, context.now);
    case "done":
      return rowLineWords.finishedInTime(took(summary));
    case "failed":
      return enteredAStep(summary)
        ? summaryWords.failedIn(step, took(summary))
        : summaryWords.failedAfter(took(summary));
    case "budget":
      return rowLineWords.budgetReached(step, took(summary));
    case "cancelled":
      return rowLineWords.cancelledIn(step, took(summary));
  }
}

/** "12:25" for a run started today, else "yesterday 10:40" or "Fri 6 Nov 10:40". */
function startedSince(started: Date, now: Date): string {
  return started.toDateString() === now.toDateString()
    ? clockTime(started)
    : startedWords(started, now);
}

/** "asked you once" or "twice" or "3 times", for each time the run waited for the user. */
function askedParts(events: readonly RunEvent[]): string[] {
  const asked = events.filter(
    (event) => event.type === "run.waiting" && event.child === undefined && event.events.length > 0,
  ).length;
  return asked === 0 ? [] : [summaryWords.askedYou(timesInWords(asked))];
}

function timesInWords(times: number): string {
  if (times === 1) return "once";
  return times === 2 ? "twice" : `${times} times`;
}

/**
 * What a run sent, one part per verb in call order, then a "may have" part per
 * verb for calls that broke off; no part at all for a run without a tool call,
 * which never says "Sent" (Studio design 4.5). The CLI's receipt still says "sent nothing".
 */
export function sendsInWords(sends: RunSends): string[] {
  if (!sends.madeToolCalls) return [];
  return [
    ...sends.sent.map(groupInWords),
    ...sends.maySend.map((group) => `may have ${groupInWords(group)}`),
  ];
}

function groupInWords(group: SendGroup): string {
  return `${group.verb} ${countsInWords(group.counts)}`;
}

/** "1 email", or "2 emails and 1 invite", or "3 emails, 2 invites and 1 file". */
function countsInWords(counts: readonly SendCount[]): string {
  const parts = counts.map(({ calls, noun }) => summaryWords.counted(calls, noun.one, noun.many));
  return parts.length <= 1
    ? parts.join("")
    : `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
}

/** One approval the run asked for, as a line of the receipt's Approvals section. */
export interface ApprovalLine {
  readonly callId: string;
  readonly text: string;
}

type RunEventOf<Type extends RunEvent["type"]> = Extract<RunEvent, { type: Type }>;

/**
 * The receipt's Approvals section (RCPT-2.4): each approval the run asked
 * for in the order asked, a tool call's or a wait step's, with the answer,
 * who gave it and when; one still waiting says so, and one left open on a
 * run that has ended (cancelled, or a child ended with its parent) says it
 * was not answered, since the run can no longer take an answer. Empty when
 * the run asked for none, which hides the section.
 *
 * @example
 * approvalLines(events);
 * // [{ callId: "call-1", text: "Send an email with Gmail: approved by you at 10:42" },
 * //  { callId: "wait-9", text: "Approve this reply?: approved by you at 10:44" }]
 */
export function approvalLines(events: readonly RunEvent[]): ApprovalLine[] {
  const answers = new Map<string, RunEventOf<"approval.resolved">>();
  for (const event of events) {
    if (event.type === "approval.resolved") answers.set(event.callId, event);
  }
  const ended = events.some(
    (event) => event.type === "run.completed" || event.type === "run.failed",
  );
  const lines: ApprovalLine[] = [];
  for (const [index, event] of events.entries()) {
    if (event.type === "approval.requested") {
      lines.push({ callId: event.callId, text: toolApprovalText(event, answers, ended) });
    } else if (event.type === "run.waiting" && isWaitStep(event, events[index - 1])) {
      const text = waitStepText(event, events.slice(index + 1), ended);
      lines.push({ callId: `wait-${event.seq}`, text });
    }
  }
  return lines;
}

function toolApprovalText(
  event: RunEventOf<"approval.requested">,
  answers: ReadonlyMap<string, RunEventOf<"approval.resolved">>,
  ended: boolean,
): string {
  const answer = answers.get(event.callId);
  const action = toolAction(event.tool);
  if (answer !== undefined) {
    return receiptWords.approvalLine(
      action,
      answer.approved ? "approved" : "rejected",
      resolver(answer.by),
      clockTime(new Date(answer.at)),
    );
  }
  return ended ? receiptWords.approvalNotAnswered(action) : receiptWords.approvalWaiting(action);
}

/** Who answered; an older log doesn't say, so no "by". */
function resolver(by: ApprovalResolver | undefined): string {
  if (by === undefined) return "";
  return by === "rule" ? receiptWords.approvalByRule : receiptWords.approvalByPerson;
}

/**
 * Whether the run waits for a wait step's answer. A tool approval and a call
 * whose outcome is unknown write their wait right after what asked, and a
 * run that waits for a child run names it; neither is the user's to answer here.
 */
function isWaitStep(waiting: RunEventOf<"run.waiting">, before: RunEvent | undefined): boolean {
  if (waiting.child !== undefined || waiting.events.length === 0) return false;
  if (before?.type === "approval.requested") return false;
  return !(before?.type === "tool.result" && before.outcome === "unknown");
}

/**
 * A wait step's line, named by its title, else its state: answered by the
 * user's event, or not answered when a timer moved it on or the run ended.
 * Only a person sends a wait step its answer, so it is "by you".
 */
function waitStepText(
  waiting: RunEventOf<"run.waiting">,
  after: readonly RunEvent[],
  ended: boolean,
): string {
  const step = waiting.title ?? waiting.state;
  const end = after.find(
    (event) =>
      event.type === "event.received" ||
      event.type === "timer.fired" ||
      event.type === "run.waiting",
  );
  if (end?.type === "event.received") {
    return receiptWords.waitAnswerLine(step, end.event, clockTime(new Date(end.at)));
  }
  return end?.type === "timer.fired" || ended
    ? receiptWords.approvalNotAnswered(step)
    : receiptWords.approvalWaiting(step);
}

/**
 * The receipt's Messages section (RCPT-2.2): what the run drafted and what it
 * sent as two separate lines, drafts first. "Sent" counts only the emails,
 * invites and the like that a tool whose risk is `send` recorded as sent (the
 * "sent" verb); a file saved is not a message. Empty hides the section.
 *
 * @example
 * messageLines(events);
 * // ["Drafted 1 email", "Sent 2 emails and 1 invite"]
 */
export function messageLines(events: readonly RunEvent[]): string[] {
  const drafted = draftsOf(events);
  const sent = sendsOf(events).sent.find((group) => group.verb === "sent");
  return [
    ...(drafted.length === 0 ? [] : [receiptWords.drafted(countsInWords(drafted))]),
    ...(sent === undefined ? [] : [receiptWords.sent(countsInWords(sent.counts))]),
  ];
}

/**
 * The receipt's Read section (RCPT-2.7): every read in one line, never one by
 * one. Empty when the run read nothing a tool sheet names, which hides it.
 *
 * @example
 * readLines(events);
 * // ["Read 12 emails and 3 Drive files"]
 */
export function readLines(events: readonly RunEvent[]): string[] {
  const reads = readsOf(events);
  return reads.length === 0 ? [] : [receiptWords.read(countsInWords(reads))];
}

/**
 * The receipt's Items section (RCPT-2.1): the files the run saved, in the
 * order it saved them, each name once, as one line. Names are plain text with
 * hidden characters escaped. Empty when it saved none, which hides the section.
 *
 * @example
 * itemLines(events);
 * // ["Created 1 file: weekly-report.md"]
 */
export function itemLines(events: readonly RunEvent[]): string[] {
  const names = new Set<string>();
  for (const event of events) {
    if (event.type === "artifact.created") names.add(escapeHidden(event.name));
  }
  return names.size === 0 ? [] : [receiptWords.createdFiles([...names])];
}

/**
 * What the agent said last, for the frame after the receipt (RCPT-3.4): the
 * output of the run's last agent that answered, as plain text with hidden
 * characters escaped. Text stays as written, line breaks included; any other
 * output is shown as its JSON. It is model output, never a source for the
 * receipt's lines (RCPT-3.1). Undefined when no agent answered with something.
 *
 * @example
 * agentSays(events);
 * // "This week: 12 emails, 3 refunds."
 */
export function agentSays(events: readonly RunEvent[]): string | undefined {
  for (let index = events.length - 1; index >= 0; index--) {
    const event = events[index];
    if (event?.type !== "agent.finished" || event.error !== undefined) continue;
    const text = outputText(event.output).trim();
    if (text !== "") return escapeHidden(text);
  }
  return undefined;
}

function outputText(output: unknown): string {
  if (output === null || output === undefined) return "";
  return typeof output === "string" ? output : (JSON.stringify(output, null, 2) ?? "");
}

/**
 * The receipt's Models and cost section (RCPT-2.5): one line per model with
 * its calls, tokens and estimated cost, then a total from the run's summary.
 * A cached answer says "cached, no model call", a call without a price says
 * "No price" and is never counted as zero, and a call the person's own
 * subscription paid for says so. Empty when the run made no model call, which
 * hides the section. A model name is plain text with hidden characters escaped:
 * a workspace's models or a provider's reply decide it.
 *
 * @example
 * modelLines(events, summary, "EUR");
 * // ["claude-sonnet · 2 calls · 1,204 in · 312 out · €0.008", "Estimated cost €0.008 · from the prices in workspace settings › Models"]
 */
export function modelLines(
  events: readonly RunEvent[],
  summary: Pick<RunSummary, "cost" | "unpricedCalls">,
  currency: string,
): string[] {
  const models = new Map<string, ModelTotals>();
  for (const event of events) {
    if (event.type !== "llm.response") continue;
    // The test model's ids ("echo", "scripted") mean nothing to the person: one line names it.
    const name = event.provider === testModelProvider ? receiptWords.testModel : event.model;
    const totals = models.get(name) ?? emptyTotals();
    models.set(name, totals);
    addCall(totals, event);
  }
  if (models.size === 0) return [];
  const lines = [...models].map(([model, totals]) => modelLine(model, totals, currency));
  const total = totalLine(summary, currency);
  return total === undefined ? lines : [...lines, total];
}

/** One model response into its model's totals. */
function addCall(totals: ModelTotals, event: Extract<RunEvent, { type: "llm.response" }>): void {
  totals.calls++;
  if (event.cached === true) {
    totals.cached++;
    return;
  }
  totals.input += event.usage.inputTokens;
  totals.output += event.usage.outputTokens;
  if (event.paidBy === "subscription") totals.subscription++;
  else if (event.cost === undefined) totals.unpriced++;
  else if (event.cost === 0) {
    // A price of 0 is a call that cost nothing (the test model), never an amount.
    totals.free++;
  } else totals.cost += event.cost;
}

interface ModelTotals {
  calls: number;
  cached: number;
  subscription: number;
  unpriced: number;
  /** Calls with a price of 0, such as the built-in test model's. */
  free: number;
  input: number;
  output: number;
  cost: number;
}

/** The id the workspace gives the built-in test model. */
const testModelProvider = "mock";

function emptyTotals(): ModelTotals {
  return {
    calls: 0,
    cached: 0,
    subscription: 0,
    unpriced: 0,
    free: 0,
    input: 0,
    output: 0,
    cost: 0,
  };
}

function modelLine(model: string, totals: ModelTotals, currency: string): string {
  const parts = [receiptWords.modelCalls(escapeHidden(model), totals.calls)];
  if (totals.cached === totals.calls)
    return [...parts, receiptWords.modelCached].join(lineSeparator);
  parts.push(receiptWords.modelTokens(totals.input, totals.output));
  const priced = totals.calls - totals.cached - totals.subscription - totals.unpriced - totals.free;
  if (priced > 0) parts.push(moneyAmount(totals.cost, currency));
  if (totals.unpriced > 0) parts.push(receiptWords.modelNoPrice);
  if (totals.free > 0) parts.push(receiptWords.modelNoCost);
  if (totals.subscription > 0) parts.push(receiptWords.modelSubscription);
  if (totals.cached > 0) parts.push(receiptWords.modelCachedCalls(totals.cached));
  return parts.join(lineSeparator);
}

/** The total: the estimated cost and the calls without a price; nothing when neither is there. */
function totalLine(
  summary: Pick<RunSummary, "cost" | "unpricedCalls">,
  currency: string,
): string | undefined {
  if (summary.cost > 0) {
    return receiptWords.modelsTotal(moneyAmount(summary.cost, currency), summary.unpricedCalls);
  }
  return summary.unpricedCalls > 0
    ? receiptWords.modelsTotalUnpriced(summary.unpricedCalls)
    : undefined;
}
