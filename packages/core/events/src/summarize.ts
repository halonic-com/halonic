import type { Usage } from "./run-basics.ts";
import type { RunEvent } from "./run-event.ts";
import type { RunSummary } from "./run-summary.ts";
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
    statesVisited: [],
    context: {},
    error: null,
    definitionsVersion: first.definitionsVersion,
    trigger: first.trigger ?? null,
    parentRunId: first.parent?.runId ?? null,
    waitingOn: null,
    accepts: [],
    nextTimer: null,
    approval: null,
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
      addModelCall(summary, event.usage, event.cost);
      return;
    case "context.updated":
      summary.context[event.key] = event.value;
      return;
    case "run.waiting":
      summary.status = "waiting";
      summary.waitingOn = event.child ?? null;
      summary.accepts = event.events;
      summary.nextTimer = earliestTimer(event.timers);
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
      summary.approval = {
        agent: event.agent,
        tool: event.tool,
        args: event.args,
        callId: event.callId,
      };
      return;
    case "approval.resolved":
      summary.approval = null;
      return;
    case "event.received":
    case "workflow.finished":
    case "timer.fired":
      summary.status = "running";
      summary.waitingOn = null;
      summary.accepts = [];
      summary.nextTimer = null;
      return;
    case "run.completed":
      summary.status = "completed";
      summary.endedAt = event.at;
      summary.context = event.context;
      return;
    case "run.failed":
      summary.status = "failed";
      summary.endedAt = event.at;
      summary.error = event.error;
      return;
    default:
      return;
  }
}

/** Add one model call's tokens, and its cost when it has a price. */
function addModelCall(summary: RunSummary, usage: Usage, cost: number | undefined): void {
  summary.usage.inputTokens += usage.inputTokens;
  summary.usage.outputTokens += usage.outputTokens;
  if (cost === undefined) summary.unpricedCalls++;
  else summary.cost += cost;
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
