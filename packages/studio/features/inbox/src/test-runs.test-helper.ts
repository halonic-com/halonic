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
    cantTry: [],
    lastSeq: 5,
    updatedAt: "2026-11-10T10:40:00.000Z",
    ...fields,
  };
}

/**
 * A tool call waiting for approval, asked at `at`. A `connector__tool` name
 * stands for the engine's log: the bare tool with its `connector`.
 */
export function pendingApproval(
  callId: string,
  tool: string,
  at: string,
): RunSummary["approvals"][number] {
  const separator = tool.indexOf("__");
  return {
    agent: "sorter",
    tool: separator > 0 ? tool.slice(separator + 2) : tool,
    ...(separator > 0 ? { connector: tool.slice(0, separator) } : {}),
    args: { title: "Refund for order 1042" },
    callId,
    at,
    state: "sort",
    branch: null,
    item: null,
  };
}
