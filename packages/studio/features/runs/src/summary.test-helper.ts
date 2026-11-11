import type { PendingApproval, RunSummary } from "@halonicjs/events";

/** 10:40 on Monday 9 Nov 2026, in the computer's own time zone. */
export const mondayMorning = new Date(2026, 10, 9, 10, 40);

/** The moment `minutes` after {@link mondayMorning}, as the run log writes it. */
export function minutesLater(minutes: number): string {
  return new Date(mondayMorning.getTime() + minutes * 60_000).toISOString();
}

/** A summary of an Acme Support reply run, started at {@link mondayMorning}, changed by `changes`. */
export function summaryWith(changes: Partial<RunSummary>): RunSummary {
  return {
    id: "run_mfx3k2a1_01jd8q",
    hubId: "acme",
    workflowId: "support-reply",
    kind: "run",
    status: "running",
    state: "draft",
    startedAt: minutesLater(0),
    endedAt: null,
    usage: { inputTokens: 0, outputTokens: 0 },
    cost: 0,
    unpricedCalls: 0,
    subscriptionCalls: 0,
    statesVisited: ["read", "classify", "draft"],
    context: {},
    error: null,
    reason: null,
    definitionsVersion: "v1",
    trigger: null,
    parentRunId: null,
    waitingOn: null,
    accepts: [],
    answerLabels: {},
    nextTimer: null,
    waitingFor: null,
    lastWaitingAt: null,
    approvals: [],
    signals: [],
    cantTry: [],
    lastSeq: 7,
    updatedAt: minutesLater(2),
    ...changes,
  };
}

/** Reporter asking to send an email from the step Send, `minutes` after the start. */
export function approvalAt(minutes: number): PendingApproval {
  return {
    agent: "reporter",
    tool: "gmail_send",
    args: {},
    callId: `call-${minutes}`,
    at: minutesLater(minutes),
    state: "send",
    branch: null,
    item: null,
  };
}
