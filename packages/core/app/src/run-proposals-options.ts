// What the run proposal service needs from the host, and what `open`
// gives the harness. Part of `run-proposals.ts`'s API, which re-exports it.

import type { Clock, DefinitionStore, Digest } from "@halonicjs/ports";
import type { Trash } from "./review-types.ts";
import type { RunCopies } from "./run-proposal-copy-texts.ts";
import type { ProposalVcs } from "./run-proposal-git-texts.ts";
import type { ProposalRecordLock } from "./run-proposal-store.ts";

/** What the run proposal service needs from the host. */
export interface RunProposalsOptions {
  /**
   * The workspace's version control, or `null` when it has none (history
   * off). Its worktrees go in Halonic's data folder, never in the workspace.
   */
  readonly vcs: ProposalVcs | null;
  /**
   * Where runs with history off get their copy of the workspace
   * (`app.run-proposal-history-off`). Without it, such a run can't start.
   */
  readonly copies?: RunCopies;
  /**
   * The records' own store, in the workspace's folder in the profile, as
   * for review records. Never the workspace's store: git could bring a
   * record in from there (HAL-3417).
   */
  readonly records: DefinitionStore;
  /**
   * Keeps other processes off a run's record while one decides it. Pass one
   * when another process can open the same records; without it, only this
   * process's turns keep the work on a record apart.
   */
  readonly recordLock?: ProposalRecordLock;
  /** Hashes each file's base for the write-if-unchanged check. */
  readonly digest: Digest;
  /** Dates a proposal, so its ref can go after 30 days. */
  readonly clock: Clock;
  /**
   * Receives the error of an `end` that couldn't finish. `end` never
   * throws: the engine calls it after the run has ended, in the middle of
   * a cancel or a parent's step. What it left is cleared at the next start.
   */
  readonly onEndFailed: (runId: string, error: unknown) => void;
  /** The workspace's files, which Accept writes. */
  readonly store: DefinitionStore;
  /** Where Accept of a file the run deleted moves it, so Undo can bring it back. */
  readonly trash: Trash;
}

/** What `open` gives the harness. */
export interface RunWorktree {
  /** The only folder the run may write workspace files in: absolute, outside the workspace. */
  readonly folder: string;
}
