// Which tool calls of a step failed, and why, from the run log alone: what
// Studio's step panel and `halonic runs show` put a "Didn't work" line under
// (HAL-12415, option a; microcopy 1.6, E1), with its cause when the engine
// logged one (HAL-12471), and a call a person approved whose connector then
// didn't start (HAL-15009). Moved from Studio so both say the same (HAL-15149).

import {
  entryOf,
  type RunEvent,
  type ToolFailureCause,
  toolFailureCauseOf,
} from "@halonicjs/events";
import { escapeHidden } from "@halonicjs/std";

/**
 * A tool call whose `tool.result` has the outcome `error` or `unknown`. Only
 * typed fields of the log fill it: the result's text is the engine's or the
 * tool's own words, which a screen never shows (microcopy 1.6, E3).
 */
export interface FailedCall {
  /**
   * Why, when the log says: `no-answer` when the call broke off without an
   * answer (outcome `unknown`), so it may or may not have done its work.
   * Absent for `error`, whose reason is only in the result's text.
   */
  readonly reason?: "no-answer";
  /**
   * Why it failed, when the engine logged a cause it knows on the result
   * (`events.tool-result-cause`): it ran out of time, the engine stopped,
   * the call wasn't made or the connector didn't start. A program's or a
   * secret's `name` is escaped like every other value from the log.
   */
  readonly cause?: ToolFailureCause;
  /** The connector the tool came from, "notes-mcp", when the log names it right before the call. */
  readonly connector?: string;
}

/** Why a connector didn't start, as `connector.listing-failed` and `tool.result` log it. */
export type ConnectorStartCause = Extract<ToolFailureCause, { code: "connector-not-started" }>;

/** One failed tool call of a step. */
export interface FailedToolCall {
  /**
   * The `seq` of its `tool.called`, or of its `approval.requested` for a
   * call a person approved that was never made.
   */
  readonly id: number;
  /** The tool's name as the model wrote it, "send_email", escaped. */
  readonly tool: string;
  /** Its arguments as the log holds them. */
  readonly args: unknown;
  readonly failed: FailedCall;
}

type ApprovalRequested = Extract<RunEvent, { type: "approval.requested" }>;

/**
 * The tool calls among `stepLog`, one step's events from `events`, that
 * failed, in the order they were asked for: a made call by its
 * `tool.called`, and a call a person approved whose connector then didn't
 * start by its `approval.requested` (see {@link approvedCallsNotMade}).
 *
 * @example
 * failedToolCalls(events, eventsBySteps(events)[0] ?? []);
 * // [{ id: 6, tool: "create_note", args: { title: "Refund" }, failed: { reason: "no-answer", connector: "notes-mcp" } }]
 */
export function failedToolCalls(
  events: readonly RunEvent[],
  stepLog: readonly RunEvent[],
): FailedToolCall[] {
  const failures = failedCalls(events);
  const made = stepLog.flatMap((event) => {
    if (event.type !== "tool.called") return [];
    const failed = failures.get(event.seq);
    return failed === undefined
      ? []
      : [{ id: event.seq, tool: escapeHidden(event.tool), args: event.args, failed }];
  });
  return [...made, ...approvedCallsNotMade(stepLog)].sort((first, second) => first.id - second.id);
}

/**
 * The calls among `stepLog` that a person approved but whose connector then
 * didn't start, so the engine logged a `tool.result` with a
 * `connector-not-started` cause and no `tool.called` (HAL-13829). Each is
 * listed from its `approval.requested`, which names the tool, its arguments
 * and its connector. An approved call that was made has its own
 * `tool.called` and is listed from that.
 */
function approvedCallsNotMade(stepLog: readonly RunEvent[]): FailedToolCall[] {
  const approvals = new WaitingApprovedCalls();
  const calls: FailedToolCall[] = [];
  for (const event of stepLog) {
    if (event.type === "approval.requested") approvals.asked(event);
    else if (event.type === "approval.resolved") approvals.resolved(event);
    else if (event.type === "tool.called") approvals.called(event);
    else if (event.type === "tool.result") {
      const request = approvals.answered(event);
      if (request === undefined || toolFailureCauseOf(event)?.code !== "connector-not-started") {
        continue;
      }
      calls.push({
        id: request.seq,
        tool: escapeHidden(request.tool),
        args: request.args,
        failed: failedCallOf(event, request.connector),
      });
    }
  }
  return calls;
}

/**
 * The calls a person approved that are neither made nor answered yet, as a
 * step's log is read in order.
 */
class WaitingApprovedCalls {
  readonly #asked = new Map<string, ApprovalRequested>();
  #approved: ApprovalRequested[] = [];

  asked(request: ApprovalRequested): void {
    this.#asked.set(request.callId, request);
  }

  resolved(answer: Extract<RunEvent, { type: "approval.resolved" }>): void {
    const request = this.#asked.get(answer.callId);
    if (answer.approved && request !== undefined) this.#approved.push(request);
  }

  /** The call was made: it has its own `tool.called`. */
  called(call: Extract<RunEvent, { type: "tool.called" }>): void {
    this.#approved = this.#approved.filter((request) => !isCallOf(request, call));
  }

  /** The approved call `result` answers, if one waits for it; it no longer waits. */
  answered(result: Extract<RunEvent, { type: "tool.result" }>): ApprovalRequested | undefined {
    const request = this.#approved.find((candidate) => isCallOf(candidate, result));
    this.#approved = this.#approved.filter((candidate) => candidate !== request);
    return request;
  }
}

/**
 * Whether `event`, a `tool.called` or a `tool.result`, is the call `request`
 * asked about: the same tool, by the state's agent or by the subagent whose
 * call it was.
 */
function isCallOf(
  request: ApprovalRequested,
  event: Extract<RunEvent, { type: "tool.called" | "tool.result" }>,
): boolean {
  return (
    event.tool === request.tool &&
    (event.agent === request.agent || event.agent === request.subagent)
  );
}

/**
 * The tool calls of the whole log that failed, by the `seq` of their
 * `tool.called`. A `tool.result` finds its call the way the timeline does
 * (`entryOf`); a result from an older log, without `outcome`, counts as
 * one that worked.
 */
function failedCalls(events: readonly RunEvent[]): Map<number, FailedCall> {
  const entries = entryOf(events);
  const indexBySeq = new Map(events.map((event, index) => [event.seq, index]));
  const failures = new Map<number, FailedCall>();
  events.forEach((event, index) => {
    if (event.type !== "tool.result") return;
    if (event.outcome !== "error" && event.outcome !== "unknown") return;
    const calledIndex = indexBySeq.get(entries[index] ?? event.seq);
    if (calledIndex === undefined) return;
    const called = events[calledIndex];
    if (called?.type !== "tool.called") return;
    failures.set(
      called.seq,
      failedCallOf(event, connectorBefore(events[calledIndex - 1], called.tool)),
    );
  });
  return failures;
}

/** What the line under a failed call says, from its `tool.result` and the connector the log names. */
function failedCallOf(
  result: Extract<RunEvent, { type: "tool.result" }>,
  connector: string | undefined,
): FailedCall {
  const cause = toolFailureCauseOf(result);
  return {
    ...(result.outcome === "unknown" ? { reason: "no-answer" as const } : {}),
    ...(cause === undefined ? {} : { cause: escapedCause(cause) }),
    ...(connector === undefined ? {} : { connector: escapeHidden(connector) }),
  };
}

/** `cause` with the only text it can carry, a program's or a secret's name, escaped. */
export function escapedCause<Cause extends ToolFailureCause>(cause: Cause): Cause {
  return cause.code === "connector-not-started" && cause.name !== undefined
    ? { ...cause, name: escapeHidden(cause.name) }
    : cause;
}

/**
 * The connector of a call to `tool`, from the event the engine logs right
 * before its `tool.called`: `connector.started` for a call that can change
 * things, `tool.unasked` for one the connector's `read` list lets through.
 * Other calls don't say which connector they went to.
 */
function connectorBefore(before: RunEvent | undefined, tool: string): string | undefined {
  if (before?.type === "connector.started") return before.connector;
  if (before?.type === "tool.unasked" && before.tool === tool) return before.connector;
  return undefined;
}
