// Where a run's texts are (HAL-3248): the folder the run writes in, and
// once it ended, the base and the run's text of each file it proposes.
// With history on, that is a worktree and a ref; with history off, a copy
// of the workspace (`app.run-proposal-history-off`). Everything else in the
// proposal service reads through this seam, never through version control.
// Internal to `core/app`.

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

/** A proposal less its items, which the service works out from its files; one kind or the other. */
export type WithoutItems<Proposal extends RunProposal> = Proposal extends RunProposal
  ? Omit<Proposal, "items">
  : never;

/** What a start keeps, for {@link KeptTexts.removeLeftovers}. */
export interface RecordedRuns<Running extends RunningRecord> {
  /** The runs the engine hasn't ended, whose folders stay. */
  readonly running: readonly Running[];
  /** Every run with a record, readable or not: what was kept for its proposal stays. */
  readonly recorded: ReadonlySet<string>;
}

/**
 * Where the texts of one kind of run are kept, once its folder is open.
 * Each kind has its own `open`.
 */
export interface KeptTexts<Running extends RunningRecord, Proposal extends RunProposal> {
  /** The folder of a running run, or `null` when it is gone. */
  folderOf(record: Running): Promise<string | null>;

  /**
   * Keeps what the run changed, for its proposal.
   *
   * @returns the proposal less its items, or `null` when nothing changed
   */
  end(record: Running): Promise<WithoutItems<Proposal> | null>;

  /** Removes the run's folder once its proposal, if any, is recorded. */
  close(record: Running): Promise<void>;

  /**
   * The texts of an open proposal.
   *
   * @throws ProposalUnavailableError when they were deleted outside Halonic
   */
  readerOf(proposal: Proposal): Promise<ProposalReader>;

  /** Whether the proposal's texts are still there. */
  isAvailable(proposal: Proposal): Promise<boolean>;

  /** Lets the texts of a settled proposal go; nothing when they are gone already. */
  release(proposal: Proposal): Promise<void>;

  /** Lets go of what a run the engine has ended kept, before its record is removed. */
  discard(record: Running): Promise<void>;

  /** Removes every run folder and kept text that `kept` doesn't keep. */
  removeLeftovers(kept: RecordedRuns<Running>): Promise<void>;
}

/** Where the texts of one workspace's runs are kept, whichever kind each run is. */
export interface ProposalTexts extends KeptTexts<RunningRecord, RunProposal> {
  /**
   * Makes the run's folder.
   *
   * @param version - the commit the run starts at, or `null` with history off
   */
  open(runId: string, version: string | null): Promise<OpenedRun>;
}
