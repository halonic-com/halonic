// The engine's proposal folders on the run proposal service (HAL-4790). The
// engine declares `RunProposalFolders` itself, so it depends on no app
// service; the host passes it this. The engine decides which runs get a
// folder and when it ends; the proposal service makes the worktree or copy,
// and keeps what the run changed as its proposal.

import type { RunProposals } from "./run-proposals.ts";

/** The top-level run a folder is opened for, as the engine's `RunProposalFolders` names it. */
export interface ProposalFolderRun {
  readonly runId: string;
  readonly hubId: string;
  readonly workflowId: string;
}

/** What {@link ProposalFolders} needs from the host. */
export interface ProposalFoldersOptions {
  readonly proposals: Pick<
    RunProposals,
    "open" | "folderOf" | "end" | "endLeftovers" | "removeLeftovers"
  >;
  /**
   * The commit the host read the run's definitions from, or `null` when it
   * read the saved files (history off), as `runSourceFor` picked them.
   */
  versionOf(run: ProposalFolderRun): Promise<string | null>;
}

/**
 * The proposal folders of top-level runs, in the shape of the engine's
 * `RunProposalFolders` (requirement `app.run-proposal-folders`).
 *
 * @example
 * const folders = new ProposalFolders({ proposals, versionOf: async (run) => commits.get(run.runId) ?? null });
 * await folders.start(openRuns); // before the engine starts any run
 * localEngine({ ...options, proposalFolders: folders });
 */
export class ProposalFolders {
  readonly #options: ProposalFoldersOptions;

  constructor(options: ProposalFoldersOptions) {
    this.#options = options;
  }

  /**
   * Opens the run's folder at the version its definitions were read from.
   * A run that is open gets its folder again.
   *
   * @returns the folder's absolute path
   * @throws what the proposal service's `open` throws; the run doesn't start
   */
  async open(run: ProposalFolderRun): Promise<string> {
    const { proposals, versionOf } = this.#options;
    const open = await proposals.folderOf(run.runId);
    if (open !== null) {
      return open;
    }
    const { folder } = await proposals.open(run.runId, await versionOf(run));
    return folder;
  }

  /** The folder of a run that is open, also after a restart; `null` when it has none. */
  folderOf(runId: string): Promise<string | null> {
    return this.#options.proposals.folderOf(runId);
  }

  /**
   * Ends the run's folder: what it changed becomes its proposal, and the
   * folder goes. Never throws: the proposal service reports an end it
   * can't finish, and the next {@link ProposalFolders.start} clears it.
   */
  async end(runId: string): Promise<void> {
    await this.#options.proposals.end(runId);
  }

  /**
   * At the host's start, before the engine starts any run: ends the folders
   * of runs the engine has already ended, keeping what they changed as
   * their proposals, then removes what is left of ends that couldn't
   * finish. The folders of `openRuns` stay.
   *
   * @param openRuns - the runs the engine hasn't ended: those waiting for a
   *   person, and those it will end as interrupted
   */
  async start(openRuns: ReadonlySet<string>): Promise<void> {
    const { proposals } = this.#options;
    await proposals.endLeftovers(openRuns);
    await proposals.removeLeftovers(openRuns);
  }
}
