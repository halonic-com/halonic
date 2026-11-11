// The proposal folders of a host that may have no folder for run copies
// (requirement `harness-host.history-off`). A run with history off gets a
// copy of the saved files; a host without copies refuses it when its folder
// opens, before the run starts, with an error that says how to turn
// history on, rather than letting it fail later at its first harness step.

import type { ProposalRun, RunProposalFolders } from "@halonicjs/engine";

/** Thrown when a run that can write files starts with history off on a host without run copies. */
export class ProposalsNeedHistoryError extends Error {
  readonly runId: string;

  constructor(runId: string) {
    super(
      `Run ${runId} can't start: its agents change files in a copy of the workspace at its version, and this workspace has none, because history is off or nothing is committed yet. Turn history on by running git init in the workspace folder and committing its files, then start the run again.`,
    );
    this.name = "ProposalsNeedHistoryError";
    this.runId = runId;
  }
}

/**
 * {@link RunProposalFolders} that refuse a run without a version to make its
 * folder at, when the host has no run copies.
 */
export class HistoryProposalFolders implements RunProposalFolders {
  readonly #folders: RunProposalFolders;
  readonly #hasCopies: boolean;

  /** @param options.hasCopies - whether the proposal service has a folder for run copies */
  constructor(options: { folders: RunProposalFolders; hasCopies: boolean }) {
    this.#folders = options.folders;
    this.#hasCopies = options.hasCopies;
  }

  /** @throws ProposalsNeedHistoryError for a run that reads the saved files, without run copies */
  async open(run: ProposalRun): Promise<string> {
    if (!this.#hasCopies && run.version?.reads !== "live-version") {
      throw new ProposalsNeedHistoryError(run.runId);
    }
    return await this.#folders.open(run);
  }

  folderOf(runId: string): Promise<string | null> {
    return this.#folders.folderOf(runId);
  }

  end(runId: string): Promise<void> {
    return this.#folders.end(runId);
  }
}
