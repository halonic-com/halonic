// The receipt's summary line (checklist part 1, 1.9; mc 15.2): what the run
// did in one wrapping line, the same parts, order and words as the CLI's
// receipt (cli-output 3.4): how it stands, what it sent, how often it asked
// the user, and its estimated cost.

import { runStanding, runWait } from "@halonicjs/app";
import type { ApprovalResolver, RunEvent, RunSends, SendGroup } from "@halonicjs/events";
import { sendsOf } from "@halonicjs/events";
import type { SourcedRun } from "../api.ts";
import { costParts, currentStepName, needsYouLine, took, waitingLine } from "../list/run-row.ts";
import { lineSeparator, receiptWords, rowLineWords, summaryWords } from "../run-words.ts";
import { clockTime } from "../time-words.ts";
import type { RunPageContext } from "./run-page-model.ts";

/**
 * The summary line of a run's receipt, from its log. Live runs say "so far"
 * once, after the last thing they sent. A run on the test model or a local
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
    ...askedParts(events),
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
      return needsYouLine(runWait(summary), step);
    case "waiting":
      return waitingLine(runWait(summary), step, context.now);
    case "done":
      return rowLineWords.finishedIn(took(summary));
    case "failed":
      return summaryWords.failedIn(step, took(summary));
    case "budget":
      return rowLineWords.budgetReached(step, took(summary));
    case "cancelled":
      return rowLineWords.cancelledIn(step, took(summary));
  }
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
 * verb for calls that broke off; "sent nothing" only for a run without a tool
 * call (cli-output 3.4, "What it sent"). The same words as the CLI's receipt.
 */
export function sendsInWords(sends: RunSends): string[] {
  if (!sends.madeToolCalls) return [summaryWords.sentNothing];
  return [
    ...sends.sent.map(groupInWords),
    ...sends.maySend.map((group) => `may have ${groupInWords(group)}`),
  ];
}

function groupInWords(group: SendGroup): string {
  const counts = group.counts.map(({ calls, noun }) =>
    summaryWords.counted(calls, noun.one, noun.many),
  );
  const list =
    counts.length <= 1 ? counts.join("") : `${counts.slice(0, -1).join(", ")} and ${counts.at(-1)}`;
  return `${group.verb} ${list}`;
}

/** One approval the run asked for, as a line of the receipt's Approvals section. */
export interface ApprovalLine {
  readonly callId: string;
  readonly text: string;
}

/**
 * The receipt's Approvals section (RCPT-2.4): each approval the run asked
 * for in the order asked, with the answer, who gave it and when; one still
 * waiting says so. Empty when the run asked for none, which hides the section.
 *
 * @example
 * approvalLines(events);
 * // [{ callId: "call-1", text: "gmail_send: approved by you at 10:42" }]
 */
export function approvalLines(events: readonly RunEvent[]): ApprovalLine[] {
  const answers = new Map<string, Extract<RunEvent, { type: "approval.resolved" }>>();
  for (const event of events) {
    if (event.type === "approval.resolved") answers.set(event.callId, event);
  }
  const lines: ApprovalLine[] = [];
  for (const event of events) {
    if (event.type !== "approval.requested") continue;
    const answer = answers.get(event.callId);
    lines.push({
      callId: event.callId,
      text:
        answer === undefined
          ? receiptWords.approvalWaiting(event.tool)
          : receiptWords.approvalLine(
              event.tool,
              answer.approved ? "approved" : "rejected",
              resolver(answer.by),
              clockTime(new Date(answer.at)),
            ),
    });
  }
  return lines;
}

/** Who answered; an older log doesn't say, so no "by". */
function resolver(by: ApprovalResolver | undefined): string {
  if (by === undefined) return "";
  return by === "rule" ? receiptWords.approvalByRule : receiptWords.approvalByPerson;
}
