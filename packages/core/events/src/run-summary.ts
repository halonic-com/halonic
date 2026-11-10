import type { RunFailureReason, RunKind, RunStatus, RunTrigger, Usage } from "./run-basics.ts";

/** A tool call a run is waiting on a person's OK for, from its `approval.requested` event. */
export interface PendingApproval {
  agent: string;
  tool: string;
  args: unknown;
  callId: string;
  /** ISO time the approval was asked for. */
  at: string;
  /** The state whose agent asked. */
  state: string;
  /** The parallel branch that asked, or `null` outside a parallel state. */
  branch: string | null;
  /** The for-each item that asked (0-based), or `null` outside a for-each state. */
  item: number | null;
}

/** A signal a run sent. `id` is "<runId>:<seq>" of its `signal.sent` event. */
export interface SentSignal {
  id: string;
  name: string;
  data: Record<string, unknown>;
  at: string;
}

/** Summary of a run, derived from its events by {@link summarize}. */
export interface RunSummary {
  id: string;
  hubId: string;
  workflowId: string;
  kind: RunKind;
  status: RunStatus;
  state: string | null;
  startedAt: string;
  endedAt: string | null;
  usage: Usage;
  /** Sum of the priced model calls, in the budget currency. Subscription calls aren't in it. */
  cost: number;
  /** Model calls without a price (their cost is unknown). Subscription calls aren't counted here. */
  unpricedCalls: number;
  /**
   * Model calls the person's own subscription paid for (`paidBy:
   * "subscription"`). Their tokens are in `usage`; they have no price and
   * are in neither `cost` nor `unpricedCalls`.
   */
  subscriptionCalls: number;
  statesVisited: string[];
  context: Record<string, unknown>;
  error: string | null;
  /**
   * Why the run failed, from its `run.failed` event. `null` while it hasn't
   * failed, and for older logs whose `run.failed` gives no reason.
   */
  reason: RunFailureReason | null;
  definitionsVersion: string;
  trigger: RunTrigger | null;
  /** The run that started this one (subflows). */
  parentRunId: string | null;
  /** While waiting: the child run that waits (send events there, or here; they are passed on). */
  waitingOn: string | null;
  /** Events the run accepts while waiting. */
  accepts: string[];
  /**
   * While waiting: event → the label the wait step's author gave that answer,
   * for the events in `accepts` that have one. Show a label in place of its
   * event name; `{}` when none has one, and in older logs.
   */
  answerLabels: Record<string, string>;
  /** While waiting: when the next timer is due (ISO), if the state has timers. */
  nextTimer: string | null;
  /**
   * While waiting: the wait step's description, filled in, as its first line
   * (`title`) and the rest (`body`); `null` when the step has none. The
   * filled-in values can be model output: show them as plain text.
   */
  waitingFor: { title: string; body: string } | null;
  /** ISO time of the last `run.waiting`, kept after the run goes on; `null` if it never waited. */
  lastWaitingAt: string | null;
  /**
   * The tool calls waiting for approval, oldest first. Parallel branches can
   * each wait for one, so there can be more than one.
   */
  approvals: PendingApproval[];
  /** Signals the run sent, in order (for signal triggers). */
  signals: SentSignal[];
  /**
   * Sequence number of the run's last event. A writer appends after it, and a
   * client subscribes from it. Not in the old summary; derived, so the run
   * log doesn't change.
   */
  lastSeq: number;
  /** ISO time of the run's last event, so a watchdog can find runs that stopped moving. */
  updatedAt: string;
}
