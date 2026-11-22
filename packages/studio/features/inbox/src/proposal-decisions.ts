// What the Inbox's proposal page decides on a run's proposal (flow-inbox 2.2,
// HAL-11945 Q5 to Q7). The app provides it from the agent host, which writes
// the files and keeps every undo step, so the page holds only ids.

import type { ProposalTarget } from "@halonicjs/app";

/** What an Accept or a Reject did. */
export interface ProposalDecided {
  /** The id of its undo step, for the toast's **Undo**; `null` when nothing changed. */
  readonly undo: string | null;
  /** Files that weren't accepted because the person changed them after the run started. */
  readonly changedSinceRun: readonly string[];
  /** Files that can't be written: they stay in the proposal, undecided for good. */
  readonly cantBeWritten: readonly string[];
}

/**
 * Accept, Reject, Undo and settle on the open workspace's run proposals. Every call fails with
 * the reason when the proposal can't be decided now, and the page shows it.
 *
 * @example
 * const { undo } = await decisions.accept("01JD8Q", { file: "hubs/support/agents/triage.yaml" });
 * if (undo !== null) await decisions.undo(undo);
 */
export interface ProposalDecisions {
  /** Writes the run's text to one file, or to every undecided one. */
  accept(runId: string, target: ProposalTarget): Promise<ProposalDecided>;
  /** Leaves one file, or every undecided one, as it is. */
  reject(runId: string, target: ProposalTarget): Promise<ProposalDecided>;
  /** Takes back the decision whose undo id an Accept or a Reject gave. */
  undo(undo: string): Promise<void>;
  /**
   * Closes the proposal once nothing in it is left to decide, which drops its undo steps, so it
   * is called only once the last **Undo** has gone. A proposal still open stays as it is.
   */
  settle(runId: string): Promise<void>;
}
