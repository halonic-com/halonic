// The run proposal folders, kept in the host (HAL-10849). A folder is a git
// worktree or a plain copy of the workspace, made and removed on disk, and
// git needs Node, so Studio's page asks for each step over loopback and the
// host answers with the folder's path.

import { readdir } from "node:fs/promises";
import {
  FolderDefinitionStore,
  FolderRunCopies,
  FolderTrash,
  makePrivateFolder,
} from "@halonicjs/adapter-fs-node";
import { lazyGitVcs } from "@halonicjs/adapter-git";
import { ProposalFolders, RunProposals } from "@halonicjs/app";
import type { ProposalRun } from "@halonicjs/engine";
import type { Digest } from "@halonicjs/ports";
import { type ProfileFolder, type WorkspaceFolders, workspaceFolders } from "@halonicjs/profile";
import { systemClock } from "@halonicjs/std";
import { namedWorkspace } from "../server/named-workspace.ts";
import { webCryptoDigest } from "./host-profiles.ts";

/** What {@link HostProposalFolders} needs to know about this computer. */
export interface HostProposalFoldersOptions {
  /** Halonic's data folder, where worktrees, copies and proposal records go. */
  readonly profile: ProfileFolder;
  /** The folders the launcher named as workspaces: no other folder gets proposal folders. */
  readonly workspaceRoots: readonly string[];
  readonly digest: Digest;
  /** Hears a folder's end that couldn't finish; the next `start` clears it. */
  readonly onEndFailed: (runId: string, error: unknown) => void;
}

/** One workspace's folders, with the profile folders they live in. */
interface WorkspaceProposals {
  readonly folders: ProposalFolders;
  readonly kept: readonly string[];
  /** Stops the workspace's git, if it started. */
  readonly close: () => Promise<void>;
}

/**
 * The proposal folders of the workspaces the launcher named, one set per
 * workspace, made at the first ask. Each method answers `undefined` for a
 * folder the launcher didn't name, and does nothing then.
 *
 * @example
 * const proposals = new HostProposalFolders(options);
 * const folder = await proposals.open(workspace, run); // the run writes only here
 * await proposals.end(workspace, run.runId);
 */
export class HostProposalFolders {
  readonly #options: HostProposalFoldersOptions;
  readonly #byWorkspace = new Map<string, Promise<WorkspaceProposals>>();

  constructor(options: HostProposalFoldersOptions) {
    this.#options = options;
  }

  /** @returns the run's folder, or `undefined` for a workspace that isn't named */
  async open(workspace: string, run: ProposalRun): Promise<string | undefined> {
    return await (await this.#of(workspace))?.folders.open(run);
  }

  /** @returns the folder of an open run (`null` when it has none), or `undefined` for a workspace that isn't named */
  async folderOf(workspace: string, runId: string): Promise<string | null | undefined> {
    return await (await this.#of(workspace))?.folders.folderOf(runId);
  }

  /** @returns `false` for a workspace that isn't named */
  async end(workspace: string, runId: string): Promise<boolean> {
    const proposals = await this.#of(workspace);
    await proposals?.folders.end(runId);
    return proposals !== undefined;
  }

  /**
   * Clears what runs that ended left, keeping the folders of `openRuns`.
   * Nothing kept means nothing to clear, so git isn't started for a
   * workspace that never ran a harness agent.
   *
   * @returns `false` for a workspace that isn't named
   */
  async start(workspace: string, openRuns: ReadonlySet<string>): Promise<boolean> {
    const proposals = await this.#of(workspace);
    if (proposals === undefined) return false;
    if (!(await allEmpty(proposals.kept))) await proposals.folders.start(openRuns);
    return true;
  }

  /**
   * Stops every workspace's git that started. Call it when the host stops,
   * once no run uses a folder any more. Safe to call twice.
   */
  async close(): Promise<void> {
    const made = [...this.#byWorkspace.values()];
    this.#byWorkspace.clear();
    for (const proposals of made) {
      // A make that failed started no git.
      await (await proposals.catch(() => undefined))?.close();
    }
  }

  async #of(workspace: string): Promise<WorkspaceProposals | undefined> {
    const real = await namedWorkspace(this.#options.workspaceRoots, workspace);
    if (real === undefined) return undefined;
    let made = this.#byWorkspace.get(real);
    if (made === undefined) {
      made = this.#make(real);
      this.#byWorkspace.set(real, made);
      // A failed make is tried again by the next ask.
      made.catch(() => this.#byWorkspace.delete(real));
    }
    return await made;
  }

  async #make(workspace: string): Promise<WorkspaceProposals> {
    const { profile, digest, onEndFailed } = this.#options;
    const folders = await workspaceFolders(profile, workspace, digest);
    await makePrivateFolder(folders.proposalRecordsFolder());
    const store = new FolderDefinitionStore(workspace);
    const git = lazyGitVcs({ location: workspace, worktrees: folders.proposalWorktreesFolder() });
    const proposals = new RunProposals({
      vcs: git.vcs,
      // With history off, a run that writes files works in a plain copy of the saved files.
      copies: new FolderRunCopies(folders.runCopiesFolder()),
      records: new FolderDefinitionStore(folders.proposalRecordsFolder()),
      store,
      trash: new FolderTrash({ folder: folders.trashFolder(), store, digest }),
      digest,
      clock: systemClock,
      onEndFailed,
    });
    return {
      folders: new ProposalFolders({ proposals }),
      kept: keptFoldersOf(folders),
      close: git.close,
    };
  }
}

function keptFoldersOf(folders: WorkspaceFolders): readonly string[] {
  return [
    folders.proposalRecordsFolder(),
    folders.proposalWorktreesFolder(),
    folders.runCopiesFolder(),
  ];
}

async function allEmpty(folders: readonly string[]): Promise<boolean> {
  for (const folder of folders) {
    const entries = await readdir(folder).catch((error: unknown) => {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    });
    if (entries.length > 0) return false;
  }
  return true;
}

/**
 * The proposal folders for the profile folder, or `undefined` without one
 * (no proposal routes are served).
 *
 * @param log - hears what can't be ended, as text for standard error
 */
export function hostProposalFolders(
  profile: ProfileFolder | undefined,
  workspaceRoots: readonly string[],
  log: (text: string) => void,
): HostProposalFolders | undefined {
  if (profile === undefined) return undefined;
  return new HostProposalFolders({
    profile,
    workspaceRoots,
    digest: webCryptoDigest,
    onEndFailed: (runId, error) =>
      log(`The proposal folder of run ${runId} couldn't be ended: ${String(error)}\n`),
  });
}
