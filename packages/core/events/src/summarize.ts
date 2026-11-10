import { addUsage } from "./add-usage.ts";
import type { Usage } from "./run-basics.ts";
import type { RunEvent } from "./run-event.ts";
import type { PendingApproval, RunSummary } from "./run-summary.ts";
import { upgradeEvent } from "./upgrade.ts";

/**
 * Fold a run's event stream into its summary. Pure; every run store uses it,
 * so all of them report a run the same way.
 *
 * @param events - the run's events, oldest first
 * @returns the summary, or `null` when the stream doesn't start with `run.started`
 *
 * @example
 * const summary = summarize(await runStore.events(runId));
 * if (summary?.status === "waiting") showButtons(summary.accepts);
 */
export function summarize(events: readonly RunEvent[]): RunSummary | null {
  const firstEvent = events[0];
  if (firstEvent === undefined) return null;
  const first = upgradeEvent(firstEvent);
  if (first.type !== "run.started") return null;

  const summary: RunSummary = {
    id: first.runId,
    hubId: first.hubId,
    workflowId: first.workflowId,
    kind: first.kind,
    status: "running",
    state: null,
    startedAt: first.at,
    endedAt: null,
    usage: { inputTokens: 0, outputTokens: 0 },
    cost: 0,
    unpricedCalls: 0,
    subscriptionCalls: 0,
    statesVisited: [],
    context: {},
    error: null,
    reason: null,
    definitionsVersion: first.definitionsVersion,
    trigger: first.trigger ?? null,
    parentRunId: first.parent?.runId ?? null,
    waitingOn: null,
    accepts: [],
    answerLabels: {},
    nextTimer: null,
    waitingFor: null,
    lastWaitingAt: null,
    approvals: [],
    signals: [],
    lastSeq: first.seq,
    updatedAt: first.at,
  };
  for (const event of events) {
    applyEvent(summary, event);
    summary.lastSeq = event.seq;
    summary.updatedAt = event.at;
  }
  return summary;
}

/** Update the summary in place with one event. Events that change nothing are skipped. */
function applyEvent(summary: RunSummary, event: RunEvent): void {
  switch (event.type) {
    case "state.entered":
      summary.state = event.state;
      summary.statesVisited.push(event.state);
      if (summary.status === "waiting") summary.status = "running";
      return;
    case "llm.response":
      addModelCall(summary, event);
      return;
    case "context.updated":
      summary.context[event.key] = event.value;
      return;
    case "run.waiting":
      summary.status = "waiting";
      summary.waitingOn = event.child ?? null;
      summary.accepts = event.events;
      summary.answerLabels = { ...event.labels };
      summary.nextTimer = earliestTimer(event.timers);
      summary.waitingFor =
        event.title === undefined && event.body === undefined
          ? null
          : { title: event.title ?? "", body: event.body ?? "" };
      summary.lastWaitingAt = event.at;
      return;
    case "signal.sent":
      summary.signals.push({
        id: `${event.runId}:${event.seq}`,
        name: event.name,
        data: event.data,
        at: event.at,
      });
      return;
    case "approval.requested":
      summary.approvals.push({
        agent: event.agent,
        tool: event.tool,
        args: event.args,
        callId: event.callId,
        at: event.at,
        state: event.state,
        branch: event.branch ?? null,
        item: event.item ?? null,
      });
      return;
    case "approval.resolved":
      removeApproval(summary.approvals, event.callId);
      return;
    case "event.received":
    case "workflow.finished":
    case "timer.fired":
      summary.status = "running";
      summary.waitingOn = null;
      summary.accepts = [];
      summary.answerLabels = {};
      summary.nextTimer = null;
      summary.waitingFor = null;
      return;
    case "run.completed":
      summary.status = "completed";
      summary.endedAt = event.at;
      summary.context = event.context;
      summary.approvals = [];
      return;
    case "run.failed":
      // A run cancelled or stopped by its budget while it waited ends its
      // approvals without an `approval.resolved`: nobody decided them.
      summary.status = "failed";
      summary.endedAt = event.at;
      summary.error = event.error;
      summary.reason = event.reason ?? null;
      summary.approvals = [];
      return;
    default:
      return;
  }
}

/**
 * Remove the waiting approval with this call id. The engine makes call ids
 * unique in a run; older logs asked for one approval at a time, so the first
 * match is the one being resolved.
 */
function removeApproval(approvals: PendingApproval[], callId: string): void {
  const index = approvals.findIndex((approval) => approval.callId === callId);
  if (index !== -1) approvals.splice(index, 1);
}

/**
 * Add one model call's tokens, and its cost when it has a price. A call the
 * person's subscription paid for is counted on its own, never priced.
 */
function addModelCall(
  summary: RunSummary,
  call: { usage: Usage; cost?: number; paidBy?: "subscription" },
): void {
  summary.usage = addUsage(summary.usage, call.usage);
  if (call.paidBy === "subscription") summary.subscriptionCalls++;
  else if (call.cost === undefined) summary.unpricedCalls++;
  else summary.cost += call.cost;
}

/**
 * The earliest due time of a wait state's timers, or `null` when it has none.
 * ISO times in the same format sort as text, which is how the old code compared them.
 */
function earliestTimer(timers: readonly { at: string }[] | undefined): string | null {
  let earliest: string | null = null;
  for (const timer of timers ?? []) {
    if (earliest === null || timer.at < earliest) earliest = timer.at;
  }
  return earliest;
}
