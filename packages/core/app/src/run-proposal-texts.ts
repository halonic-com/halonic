// Where a run's texts are (HAL-3248): the folder the run writes in, and
// once it ended, the base and the run's text of each file it proposes.
// With history on, that is a worktree and a ref; with history off it will
// be a copy of the workspace (`app.run-proposal-history-off`). Everything
// else in the proposal service reads through this seam, never through
// version control. Internal to `core/app`.

import type { RunningRecord } from "./run-proposal-record.ts";
import type { RunProposal } from "./run-proposal-types.ts";

/** A run's folder, just opened, and the running record that finds it again. */
export interface OpenedRun {
  /** The only folder the run may write workspace files in: absolute, outside the workspace. */
  readonly folder: string;
  readonly record: RunningRecord;
}

/** The texts of one proposal, once it was found to be still available. */
export interface ProposalReader {
  /**
   * A file's text in the run's base, or as the run left it.
   *
   * @returns `null` when the file is absent on that side
   */
  read(side: "base" | "run", path: string): Promise<string | null>;
}

/** Where the texts of one workspace's runs are kept. */
export interface ProposalTexts {
  /** Makes the run's folder at `version`. */
  open(runId: string, version: string): Promise<OpenedRun>;

  /** The folder of a running run, or `null` when it is gone. */
  folderOf(record: RunningRecord): Promise<string | null>;

  /**
   * Keeps what the run changed, for its proposal.
   *
   * @returns the proposal less its items, or `null` when nothing changed
   */
  end(record: RunningRecord): Promise<Omit<RunProposal, "items"> | null>;

  /** Removes the run's folder once its proposal, if any, is recorded. */
  close(record: RunningRecord): Promise<void>;

  /**
   * The texts of an open proposal.
   *
   * @throws ProposalUnavailableError when they were deleted outside Halonic
   */
  readerOf(proposal: RunProposal): Promise<ProposalReader>;

  /** Whether the proposal's texts are still there. */
  isAvailable(proposal: RunProposal): Promise<boolean>;

  /** Lets the texts of a settled proposal go; nothing when they are gone already. */
  release(proposal: RunProposal): Promise<void>;

  /** Lets go of what a run the engine has ended kept, before its record is removed. */
  discard(record: RunningRecord): Promise<void>;

  /** Removes every run folder except those of `kept`. */
  removeLeftovers(kept: readonly RunningRecord[]): Promise<void>;
}
