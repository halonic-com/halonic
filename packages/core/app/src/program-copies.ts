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

/** One run's hold on a copy. The copy goes when the last hold on it is released. */
export interface ProgramCopyLease {
  /** The folder of the copy. */
  readonly path: string;
  /** Lets go of the copy. Safe to call more than once. */
  release(): Promise<void>;
}

interface MadeCopy {
  readonly worktree: Promise<{ id: string; path: string }>;
  holders: number;
}

/**
 * Makes and removes the copies of one engine. The `vcs` it takes must have
 * a worktrees folder of its own, apart from the Studio assistant's, since
 * {@link ProgramCopies.sweep} removes every worktree its `vcs` lists.
 */
export class ProgramCopies {
  private readonly vcs: ProgramCopyVcs;
  private readonly made = new Map<string, MadeCopy>();

  constructor(vcs: ProgramCopyVcs) {
    this.vcs = vcs;
  }

  /**
   * A hold on the copy at `version`. The copy is made on the first call and
   * shared by the calls after it, so one run ending never removes a copy
   * another run is still using: it goes when the last hold is released.
   *
   * @throws {ProgramCopyUnavailableError} when the copy can't be made
   */
  async make(version: string): Promise<ProgramCopyLease> {
    let copy = this.made.get(version);
    if (copy === undefined) {
      copy = { worktree: this.vcs.addWorktree(version), holders: 0 };
      this.made.set(version, copy);
    }
    copy.holders += 1;
    const held = copy;
    try {
      const { path } = await held.worktree;
      return this.leaseOf(version, held, path);
    } catch (error) {
      // Only drop the entry while it still holds this failed copy: a later
      // call may already have replaced it with a new attempt.
      if (this.made.get(version) === held) {
        this.made.delete(version);
      }
      throw new ProgramCopyUnavailableError(version, error);
    }
  }

  /** Removes every copy this engine made, whoever still holds it. For engine stop. */
  async removeAll(): Promise<void> {
    const copies = [...this.made.values()];
    this.made.clear();
    await Promise.all(copies.map((copy) => this.removeWorktree(copy)));
  }

  /**
   * Removes every copy in the program-copies folder, left by an engine that was
   * stopped or lost power. For engine start only, while this engine holds the
   * workspace's run lock so no other engine owns one. A copy that can't be
   * removed is left for the next start; the others are still removed.
   *
   * @returns how many copies were removed
   * @throws {Error} when this engine already holds copies
   */
  async sweep(): Promise<number> {
    if (this.made.size > 0) {
      throw new Error("Program copies can only be swept at engine start, before any copy is made.");
    }
    let removed = 0;
    for (const worktree of await this.vcs.listWorktrees()) {
      try {
        await this.vcs.removeWorktree(worktree.id);
        removed += 1;
      } catch {
        // Left in place; the next engine start sweeps it again.
      }
    }
    return removed;
  }

  private leaseOf(version: string, copy: MadeCopy, path: string): ProgramCopyLease {
    let released = false;
    return {
      path,
      release: async () => {
        if (released) {
          return;
        }
        released = true;
        copy.holders -= 1;
        // A copy that is no longer in `made` was already removed by `removeAll`.
        if (copy.holders === 0 && this.made.get(version) === copy) {
          this.made.delete(version);
          await this.removeWorktree(copy);
        }
      },
    };
  }

  private async removeWorktree(copy: MadeCopy): Promise<void> {
    const made = await copy.worktree.catch(() => null);
    if (made !== null) {
      await this.vcs.removeWorktree(made.id);
    }
  }
}
