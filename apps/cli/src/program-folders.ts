// The folder a run's programs start in (HAL-4975): an unpinned stdio
// connector's script, a harness agent's working folder. A run that reads the
// live version starts them in a copy of the workspace at its commit, so a
// saved change that isn't live, such as a script an agent wrote, never runs
// before someone made it live (`app.runs-read-latest-version`). A run that
// reads the saved files, with history off, starts them in the workspace
// folder itself.

import { readdir } from "node:fs/promises";
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
}

/** The folders of one engine's programs, open until {@link ProgramFolders.close}. */
export interface ProgramFolders {
  /**
   * A hold on the folder the programs of a run that read `version` start
   * in: a copy at the commit for the live version, the workspace folder for
   * the saved files. Release it when the run's programs have stopped.
   *
   * @throws ProgramCopyUnavailableError when the copy can't be made; the
   *   saved folder is never used in its place
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
 * @throws when the copies folder can't be made, or a leftover copy is there and git can't start
 */
export async function openProgramFolders(input: ProgramFoldersInput): Promise<ProgramFolders> {
  await makePrivateFolder(input.copiesFolder);
  let opened: Promise<{ copies: ProgramCopies; runner: GitRunner }> | undefined;
  const copiesOnGit = (): Promise<{ copies: ProgramCopies; runner: GitRunner }> => {
    opened ??= openCopies(input);
    return opened;
  };
  if ((await readdir(input.copiesFolder)).length > 0) {
    const { copies } = await copiesOnGit();
    await copies.sweep();
  }
  let closing: Promise<void> | undefined;
  return {
    folderFor: async (version) => {
      if (version.reads === "saved-files") {
        return { path: input.workspaceRoot, release: async () => {} };
      }
      const copies = await copiesOnGit().then(
        (opened) => opened.copies,
        (error: unknown) => {
          throw new ProgramCopyUnavailableError(version.commit, error);
        },
      );
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

/** The copies on the workspace's git history, with the copies folder as the only worktrees folder. */
async function openCopies(
  input: ProgramFoldersInput,
): Promise<{ copies: ProgramCopies; runner: GitRunner }> {
  const runner = await GitRunner.create(input.git ?? {});
  // Copies only check versions out, so they never commit as this author.
  const vcs = new GitVcs(input.workspaceRoot, {
    runner,
    author: { name: "Halonic", email: "halonic@localhost" },
    worktrees: input.copiesFolder,
  });
  return { copies: new ProgramCopies(vcs), runner };
}
