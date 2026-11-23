// What the Inbox's proposal page decides on a run's proposal (flow-inbox 2.2,
// HAL-11945 Q5 to Q7). The app provides it from the agent host, which writes
// the files and keeps every undo step, so the page holds only ids.

import type { ProposalTarget } from "@halonicjs/app";

/** What an Accept or a Reject did. */
export interface ProposalDecided {
  /** The id of its undo step, for the toast's **Undo**; `null` when nothing changed. */
  readonly undo: string | null;
  /** Files that weren't accepted because they changed after the run started. */
  readonly changedSinceRun: readonly string[];
  /** Files that can't be written: they stay in the proposal, undecided for good. */
  readonly cantBeWritten: readonly string[];
}

/** What an Undo left as it was. A file it didn't put back keeps its decision. */
export interface ProposalUndone {
  /**
   * Files the host didn't put back: one changed after the decision or can't be written, or every
   * file of the step when {@link decidedAfter}.
   */
  readonly leftAlone: readonly string[];
  /** Whether a later decision on one of the step's files kept all of it from coming back. */
  readonly decidedAfter: boolean;
}

/**
 * What a decision or an Undo fails with when the proposal's texts are gone, for example because
 * its branch was deleted: it can't be opened any more, only removed (HAL-11945 Q11).
 */
export class ProposalGoneError extends Error {
  override readonly name = "ProposalGoneError";
}

/**
 * Why a call on a proposal failed, as the Inbox words it (C681 32, C665 27): its changes are there
 * again (only a Remove), the engine isn't answering, the workspace isn't trusted yet, or a reason
 * Halonic can't explain yet.
 */
export type ProposalFailure = "changes-back" | "not-answering" | "untrusted" | "unexplained";

/**
 * A failure the app sorted by the host's kind, so the page picks its words from `failure`. The
 * message is the host's own text, which reaches the person only through **Copy details**.
 */
export class ProposalFailedError extends Error {
  override readonly name = "ProposalFailedError";
  readonly failure: ProposalFailure;

  constructor(failure: ProposalFailure, details: string) {
    super(details);
    this.failure = failure;
  }
}

/**
 * Accept, Reject, Undo, settle and Remove on the open workspace's run proposals. Every call fails
 * with {@link ProposalGoneError} when its texts are gone, and otherwise with
 * {@link ProposalFailedError}, which the page words by its `failure`.
 *
 * @example
 * const { undo } = await decisions.accept("01JD8Q", { file: "hubs/support/agents/triage.yaml" });
 * if (undo !== null) {
 *   const { leftAlone } = await decisions.undo(undo);
 * }
 */
export interface ProposalDecisions {
  /** Writes the run's text to one file, or to every undecided one. */
  accept(runId: string, target: ProposalTarget): Promise<ProposalDecided>;
  /** Leaves one file, or every undecided one, as it is. */
  reject(runId: string, target: ProposalTarget): Promise<ProposalDecided>;
  /** Takes back the decision whose undo id an Accept or a Reject gave, as far as the host can. */
  undo(undo: string): Promise<ProposalUndone>;
  /**
   * Closes the proposal once nothing in it is left to decide, which drops its undo steps, so it
   * is called only once the last **Undo** has gone. A proposal still open stays as it is.
   */
  settle(runId: string): Promise<void>;
  /**
   * Removes a proposal whose texts are gone: it leaves Needs you and is done as not reviewed. One
   * that can still be opened is refused, as `changes-back`.
   */
  remove(runId: string): Promise<void>;
}
