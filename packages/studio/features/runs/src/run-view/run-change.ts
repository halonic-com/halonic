// What a screen reader hears when the open run's status changes (mc 19.3,
// revision 115; a11y check A1, HAL-12456). The page announces it through the
// shell's `announceState`, under the run's own key, so a run that flips
// quickly is read once, in its last state.

import { moneyAmount, type RunWait, runStanding, runWait, shortRunId } from "@halonicjs/app";
import { type PendingApproval, type RunEvent, sendsOf } from "@halonicjs/events";
import { escapeHidden } from "@halonicjs/std";
import type { SourcedRun } from "../api.ts";
import { costParts, currentStepName, enteredAStep } from "../list/run-row.ts";
import { runPageWords } from "../run-words.ts";
import { dueWords } from "../time-words.ts";
import { budgetStopOf } from "./budget-stop.ts";
import { sendsInWords } from "./receipt-model.ts";
import { runChangeWords } from "./run-change-words.ts";
import type { RunPageContext } from "./run-page-model.ts";

/** The `announceState` key of a run: the run page and the canvas strip share it (mc 19.3). */
export function runAnnouncementKey(runId: string): string {
  return `run:${runId}`;
}

/**
 * The sentence for where the run stands now, or `undefined` while it can't be said yet: a finished
 * run says what it sent from its log, so it waits until the log has the run's end.
 *
 * @example
 * runChangeText(waitingRun, log, context);
 * // "Run 650704 needs you. Waiting for you: Approve this reply?"
 */
export function runChangeText(
  run: SourcedRun,
  log: readonly RunEvent[] | undefined,
  context: RunPageContext,
): string | undefined {
  const { summary } = run;
  const shortId = shortRunId(summary.id);
  const step = currentStepName(summary, context.workflow);
  const inAStep = enteredAStep(summary);
  switch (runStanding(summary)) {
    case "running":
      return runChangeWords.runningAgain(shortId);
    case "needs-you":
      return runChangeWords.needsYou(shortId, waitingForYou(runWait(summary), step, context));
    case "waiting":
      return waitingText(shortId, runWait(summary), context);
    case "done":
      return finishedText(run, log, context);
    case "failed":
      return inAStep ? runChangeWords.failedIn(shortId, step) : runChangeWords.failed(shortId);
    case "budget":
      return budgetText(run);
    case "cancelled":
      return inAStep
        ? runChangeWords.cancelledIn(shortId, step)
        : runChangeWords.cancelled(shortId);
    case "cant-try":
      return runChangeWords.cantTry(shortId, step);
  }
}

/** After "Run 01jd8q needs you.": the approval's ask, or the wait step's banner words (mc 15.2). */
function waitingForYou(wait: RunWait, step: string, context: RunPageContext): string {
  if (wait.kind === "approvals") {
    return runChangeWords.approval(approvalAsk(wait.oldest, context));
  }
  if (wait.kind === "step" && wait.title !== null) {
    return runPageWords.waitStep(escapeHidden(wait.title));
  }
  return runPageWords.waitStepNoDescription(step);
}

/** "Sorter wants to use create_note (notes-mcp)": the banner's ask, with the tool's connector when it has one. */
function approvalAsk(approval: PendingApproval, context: RunPageContext): string {
  const asker = approval.subagent ?? approval.agent;
  const ask = runPageWords.approvalAsk(
    escapeHidden(context.agentName?.(asker) ?? asker),
    approval.tool,
  );
  return approval.connector === undefined ? ask : `${ask} (${escapeHidden(approval.connector)})`;
}

/** A wait that isn't for the user: until a time, or for a child run. */
function waitingText(shortId: string, wait: RunWait, context: RunPageContext): string {
  if (wait.kind === "timer") {
    return runChangeWords.waitingUntil(shortId, dueWords(new Date(wait.at), context.now));
  }
  if (wait.kind === "child-run") {
    return runChangeWords.waitingForChild(shortId, shortRunId(wait.runId));
  }
  return runChangeWords.waiting(shortId);
}

/**
 * "Run 01jd8q finished. Sent 1 email, estimated cost €0.01.": the receipt summary's sent part and
 * its cost, never its "Finished in 2 min" (mc 19.3, revision 115).
 */
function finishedText(
  run: SourcedRun,
  log: readonly RunEvent[] | undefined,
  context: RunPageContext,
): string | undefined {
  if (log?.some((event) => event.type === "run.completed") !== true) {
    return undefined;
  }
  const { summary } = run;
  return runChangeWords.finished(shortRunId(summary.id), [
    ...sendsInWords(sendsOf(log)),
    ...costParts(summary, context.currency),
  ]);
}

/** "… stopped at its budget: estimated €5.08 of €5.00.", without the figures when the cause has none. */
function budgetText(run: SourcedRun): string {
  const shortId = shortRunId(run.summary.id);
  const stop = budgetStopOf(run.summary);
  if (stop === undefined) {
    return runChangeWords.budget(shortId);
  }
  const amount = (value: number) => moneyAmount(value, stop.currency, { tiny: "less than" });
  return runChangeWords.budgetSpent(shortId, amount(stop.spent), amount(stop.budget));
}
