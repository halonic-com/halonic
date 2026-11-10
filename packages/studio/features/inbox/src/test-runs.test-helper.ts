import type { RunSummary } from "@halonicjs/events";

/** A waiting run's summary, with the fields the Inbox reads set from `fields`. */
export function waitingRun(id: string, fields: Partial<RunSummary> = {}): RunSummary {
  return {
    id,
    hubId: "acme",
    workflowId: "support-reply",
    kind: "run",
    status: "waiting",
    state: "review",
    startedAt: "2026-11-10T10:00:00.000Z",
    endedAt: null,
    usage: { inputTokens: 0, outputTokens: 0 },
    cost: 0,
    unpricedCalls: 0,
    subscriptionCalls: 0,
    statesVisited: [],
    context: {},
    error: null,
    reason: null,
    definitionsVersion: "v1",
    trigger: null,
    parentRunId: null,
    waitingOn: null,
    accepts: ["approve", "reject"],
    answerLabels: {},
    nextTimer: null,
    waitingFor: null,
    lastWaitingAt: "2026-11-10T10:40:00.000Z",
    approvals: [],
    signals: [],
    lastSeq: 5,
    updatedAt: "2026-11-10T10:40:00.000Z",
    ...fields,
  };
}

/** A tool call waiting for approval, asked at `at`. */
export function pendingApproval(
  callId: string,
  tool: string,
  at: string,
): RunSummary["approvals"][number] {
  return {
    agent: "sorter",
    tool,
    args: { title: "Refund for order 1042" },
    callId,
    at,
    state: "sort",
    branch: null,
    item: null,
  };
}
