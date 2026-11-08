import type { RunKind, RunStatus, RunTrigger, Usage } from "./run-basics.ts";

/** The tool call a run is waiting on a person's OK for. */
export interface PendingApproval {
  agent: string;
  tool: string;
  args: unknown;
  callId: string;
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
  /** Sum of the priced model calls, in the budget currency. */
  cost: number;
  /** Model calls without a price (their cost is unknown). */
  unpricedCalls: number;
  statesVisited: string[];
  context: Record<string, unknown>;
  error: string | null;
  definitionsVersion: string;
  trigger: RunTrigger | null;
  /** The run that started this one (subflows). */
  parentRunId: string | null;
  /** While waiting: the child run that waits (send events there, or here; they are passed on). */
  waitingOn: string | null;
  /** Events the run accepts while waiting. */
  accepts: string[];
  /** While waiting: when the next timer is due (ISO), if the state has timers. */
  nextTimer: string | null;
  /** The tool call waiting for approval, when the run waits for one. */
  approval: PendingApproval | null;
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
