// The folder a run's programs start in (HAL-4975): an unpinned stdio
// connector's script, a harness agent's working folder. A run that reads the
// live version starts them in a copy of the workspace at its commit, so a
// saved change that isn't live, such as a script an agent wrote, never runs
// before someone made it live (`app.runs-read-latest-version`). A run that
// reads the saved files, with history off, starts them in the workspace
// folder itself.

import { readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { makePrivateFolder } from "@halonicjs/adapter-fs-node";
import { GitRunner, type GitRunnerOptions, GitVcs } from "@halonicjs/adapter-git";
import { ProgramCopies, type ProgramCopyLease, ProgramCopyUnavailableError } from "@halonicjs/app";
import type { RunVersion } from "@halonicjs/events";

/** What {@link openProgramFolders} needs. */
export interface ProgramFoldersInput {
  /** The workspace folder, as `openWorkspaceDir` found it. */
  readonly workspaceRoot: string;
  /**
   * The folder the copies go in, in the workspace's folder in the profile
   * (`programCopiesFolder()` of `workspaceFolders`). Only the engine holding
   * the workspace's engine lock may use it: every copy in it is removed.
   */
  readonly copiesFolder: string;
  /** Which git; the one on the `PATH` by default. */
  readonly git?: GitRunnerOptions;
  /**
   * Hears a leftover copy git couldn't sweep, such as when the workspace has
   * no history any more. The engine still opens: leftovers are clean-up,
   * never a reason to refuse a run.
   */
  reportError(error: unknown): void;
}

/** The copies on the workspace's git history, once git has started. */
interface CopiesOnGit {
  readonly copies: ProgramCopies;
  readonly vcs: GitVcs;
  readonly runner: GitRunner;
}

/** The folders of one engine's programs, open until {@link ProgramFolders.close}. */
export interface ProgramFolders {
  /**
   * A hold on the folder the programs of a run that read `version` start
   * in: a copy at the commit for the live version, the workspace folder for
   * the saved files. Release it when the run's programs have stopped.
   *
   * @throws ProgramCopyUnavailableError when the copy can't be made, or
   *   once {@link ProgramFolders.close} has started; the saved folder is
   *   never used in its place
   */
  folderFor(version: RunVersion): Promise<ProgramCopyLease>;
  /** Removes every copy, whoever still holds it, and stops git. Safe to call twice. */
  close(): Promise<void>;
}

/**
 * Opens the program folders of the engine on `input.workspaceRoot`. Copies
 * left in `input.copiesFolder` by an engine that was stopped or lost power
 * are removed first. Git starts only for a leftover copy or the first copy
 * a run asks for, so a run that starts no program never pays for it.
 *
 * Call it only while holding the workspace's engine lock.
 *
 * @throws when the copies folder can't be made or emptied
 */
export async function openProgramFolders(input: ProgramFoldersInput): Promise<ProgramFolders> {
  await makePrivateFolder(input.copiesFolder);
  let opened: Promise<CopiesOnGit> | undefined;
  const copiesOnGit = (): Promise<CopiesOnGit> => {
    // A git that failed to start (say the runner was short of processes)
    // is tried again by the next run, not held against every run after it.
    opened ??= openCopies(input).catch((error: unknown) => {
      opened = undefined;
      throw error;
    });
    return opened;
  };
  await removeLeftovers(input, copiesOnGit);
  let closing: Promise<void> | undefined;
  // A copy made once close has taken its list would stay until the next
  // open, and a git started after it would never be stopped.
  const refuseOnceClosing = (version: string): void => {
    if (closing !== undefined) {
      throw new ProgramCopyUnavailableError(version, new Error("The engine is stopping."));
    }
  };
  return {
    folderFor: async (version) => {
      if (version.reads === "saved-files") {
        return { path: input.workspaceRoot, release: async () => {} };
      }
      refuseOnceClosing(version.commit);
      const copies = await copiesOnGit().then(
        (started) => started.copies,
        (error: unknown) => {
          throw new ProgramCopyUnavailableError(version.commit, error);
        },
      );
      // Close may have started while git did. `make` records the copy before
      // it awaits anything, so a close that starts after this check removes it.
      refuseOnceClosing(version.commit);
      return await copies.make(version.commit);
    },
    close: () => {
      closing ??= (async () => {
        // Git that never started has no copies to remove.
        const started = await opened?.catch(() => undefined);
        if (started === undefined) {
          return;
        }
        const { copies, runner } = started;
        try {
          await copies.removeAll();
        } finally {
          await runner.close();
        }
      })();
      return closing;
    },
  };
}

/**
 * Empties the copies folder of what a stopped engine left: git removes the
 * copies it still has a record of, and anything else goes as a plain
 * folder, such as a copy whose record is gone after a re-clone, or every
 * copy when the workspace has no history any more. Otherwise those stay in
 * the profile for good and make git start on every open. A copy git lists
 * but couldn't remove is left for the next open.
 */
async function removeLeftovers(
  input: ProgramFoldersInput,
  copiesOnGit: () => Promise<CopiesOnGit>,
): Promise<void> {
  if ((await readdir(input.copiesFolder)).length === 0) {
    return;
  }
  let stillListed = new Set<string>();
  try {
    const { copies, vcs } = await copiesOnGit();
    await copies.sweep();
    // A copy's folder in the copies folder is named after its id.
    stillListed = new Set((await vcs.listWorktrees()).map((worktree) => worktree.id));
  } catch (error) {
    input.reportError(error);
  }
  for (const entry of await readdir(input.copiesFolder)) {
    if (!stillListed.has(entry)) {
      await rm(join(input.copiesFolder, entry), { recursive: true, force: true });
    }
  }
}

/** The copies on the workspace's git history, with the copies folder as the only worktrees folder. */
async function openCopies(input: ProgramFoldersInput): Promise<CopiesOnGit> {
  const runner = await GitRunner.create(input.git ?? {});
  // Copies only check versions out, so they never commit as this author.
  const vcs = new GitVcs(input.workspaceRoot, {
    runner,
    author: { name: "Halonic", email: "halonic@localhost" },
    worktrees: input.copiesFolder,
  });
  return { copies: new ProgramCopies(vcs), vcs, runner };
}
