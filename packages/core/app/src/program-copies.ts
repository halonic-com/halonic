// A run's copy of the workspace (HAL-4975): the programs a live run starts
// read the files at the run's commit, not the folder as saved. The copy is a
// worktree in a folder of its own, so it never holds more than git holds at
// that commit: private entries such as `.env` are left out, and nothing
// installed (`node_modules`, `.venv`) comes across.

import type { Vcs } from "@halonicjs/ports";

/** The part of the `Vcs` port the run copies use. */
export type ProgramCopyVcs = Pick<Vcs, "addWorktree" | "removeWorktree" | "listWorktrees">;

/** Raised when a copy can't be made. The run never falls back to the saved folder. */
export class ProgramCopyUnavailableError extends Error {
  constructor(version: string, cause: unknown) {
    super(
      `Couldn't make a copy of the workspace at version ${version} for this run, so its programs were not started.`,
      { cause },
    );
    this.name = "ProgramCopyUnavailableError";
  }
}

/**
 * Makes and removes the copies of one engine. The `vcs` it takes must have
 * a worktrees folder of its own, apart from the Studio assistant's, since
 * {@link ProgramCopies.sweep} removes every worktree its `vcs` lists.
 */
export class ProgramCopies {
  private readonly vcs: ProgramCopyVcs;
  private readonly made = new Map<string, Promise<{ id: string; path: string }>>();

  constructor(vcs: ProgramCopyVcs) {
    this.vcs = vcs;
  }

  /**
   * The folder of the copy at `version`, made on the first call and shared
   * by the calls after it until {@link ProgramCopies.remove}.
   *
   * @throws {ProgramCopyUnavailableError} when the copy can't be made
   */
  async make(version: string): Promise<string> {
    let copy = this.made.get(version);
    if (copy === undefined) {
      copy = this.vcs.addWorktree(version);
      this.made.set(version, copy);
    }
    try {
      return (await copy).path;
    } catch (error) {
      this.made.delete(version);
      throw new ProgramCopyUnavailableError(version, error);
    }
  }

  /** Removes the copy at `version`, if one was made. */
  async remove(version: string): Promise<void> {
    const copy = this.made.get(version);
    if (copy === undefined) {
      return;
    }
    this.made.delete(version);
    const made = await copy.catch(() => null);
    if (made !== null) {
      await this.vcs.removeWorktree(made.id);
    }
  }

  /** Removes every copy this engine made. */
  async removeAll(): Promise<void> {
    await Promise.all([...this.made.keys()].map((version) => this.remove(version)));
  }

  /**
   * Removes every copy in the program-copies folder, left by an engine that was
   * stopped or lost power. Only safe while this engine holds the workspace's
   * run lock, so no other engine owns one.
   */
  async sweep(): Promise<number> {
    const left = await this.vcs.listWorktrees();
    for (const worktree of left) {
      await this.vcs.removeWorktree(worktree.id);
    }
    this.made.clear();
    return left.length;
  }
}
