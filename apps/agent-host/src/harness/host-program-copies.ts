// The copies of a workspace at a commit that a live run's programs start in,
// kept in the host for Studio's window (HAL-16260): git needs Node, so the
// window asks for a copy over loopback and starts the run's connectors in it,
// as the CLI does with `openProgramFolders` (HAL-4975). The host uses its own
// folder in the profile, never the CLI's: it can't tell whether it holds the
// workspace's engine lock, and each side's sweep removes everything in its
// folder.

import { realpath } from "node:fs/promises";
import type { GitRunnerOptions } from "@halonicjs/adapter-git";
import { openProgramFolders, type ProgramFolders } from "@halonicjs/adapter-program-copies-node";
import type { ProgramCopyLease } from "@halonicjs/app";
import type { Digest } from "@halonicjs/ports";
import { type ProfileFolder, workspaceFolders } from "@halonicjs/profile";
import { namedWorkspace } from "../server/named-workspace.ts";
import { webCryptoDigest } from "./host-profiles.ts";

/** What {@link HostProgramCopies} needs to know about this computer. */
export interface HostProgramCopiesOptions {
  /** Halonic's data folder, where the copies go. */
  readonly profile: ProfileFolder;
  /** The folders the launcher named as workspaces: no other folder gets copies. */
  readonly workspaceRoots: readonly string[];
  readonly digest: Digest;
  /** Stops every connector of the workspace (its real path), so none runs in a copy that is swept. */
  readonly stopConnectors: (workspace: string) => Promise<void>;
  /** Which git; the one on the `PATH` by default, with the same hardening as the CLI's. */
  readonly git?: GitRunnerOptions;
  /** Hears a leftover copy git couldn't sweep; the copies still open. */
  readonly reportError: (error: unknown) => void;
}

/** A copy the host holds, and the workspace it is a copy of, both as real paths. */
export interface HeldCopy {
  readonly copy: string;
  readonly workspace: string;
}

/** What {@link HostProgramCopies.open} answers: the copy's real path, or why there is none. */
export type OpenedCopy = { readonly path: string } | { readonly refused: string };

interface Held {
  readonly workspace: string;
  readonly leases: ProgramCopyLease[];
}

/**
 * The program copies of the workspaces the launcher named: one set per
 * workspace, and a table from each copy the host holds to its workspace.
 * Paths are compared as real paths, so a link, `..` or another spelling
 * can't name a folder the host didn't make.
 *
 * @example
 * const copies = new HostProgramCopies(options);
 * await copies.start(workspace); // stops its connectors, then sweeps
 * const opened = await copies.open(workspace, commit);
 * await copies.release(workspace, path);
 */
export class HostProgramCopies {
  readonly #options: HostProgramCopiesOptions;
  readonly #sets = new Map<string, Promise<ProgramFolders>>();
  readonly #held = new Map<string, Held>();
  /** Each workspace's last step, so a start never sweeps while an open of the same workspace makes its copy. */
  readonly #steps = new Map<string, Promise<unknown>>();
  #closed = false;

  constructor(options: HostProgramCopiesOptions) {
    this.#options = options;
  }

  /**
   * Stops the workspace's connectors, closes its open set, which removes its
   * copies, and opens a new one, which sweeps what a stopped host left.
   *
   * @returns `false` for a workspace the launcher didn't name; nothing is done then
   * @throws when the copies folder can't be made or emptied
   */
  async start(workspace: string): Promise<boolean> {
    const real = await namedWorkspace(this.#options.workspaceRoots, workspace);
    if (real === undefined) return false;
    await this.#inTurn(real, async () => {
      // First: a connector still running in a copy would lose its folder in the sweep.
      await this.#options.stopConnectors(real);
      await this.#closeSet(real);
      if (!this.#closed) await this.#setOf(real);
    });
    return true;
  }

  /**
   * A hold on the copy of the workspace at `commit`, which the host keeps
   * until {@link HostProgramCopies.release}, the next `start` or its stop.
   *
   * @returns `undefined` for a workspace the launcher didn't name, and makes nothing then
   */
  async open(workspace: string, commit: string): Promise<OpenedCopy | undefined> {
    const real = await namedWorkspace(this.#options.workspaceRoots, workspace);
    if (real === undefined) return undefined;
    return await this.#inTurn(real, async () => {
      if (this.#closed) return { refused: "The agent host is stopping." };
      try {
        const programs = await this.#setOf(real);
        // The date only names the version for people; the copy is made from the commit.
        const lease = await programs.folderFor({ reads: "live-version", commit, versionDate: "" });
        const path = await realpath(lease.path);
        const held = this.#held.get(path) ?? { workspace: real, leases: [] };
        held.leases.push(lease);
        this.#held.set(path, held);
        return { path };
      } catch (error) {
        return { refused: reasonOf(error) };
      }
    });
  }

  /**
   * Lets go of one hold on a copy; the copy goes when its last hold does.
   *
   * @returns `unknown_workspace` for a workspace the launcher didn't name, and
   *   `not_held` for a path that isn't a copy the host holds for it: nothing is removed then
   */
  async release(
    workspace: string,
    path: string,
  ): Promise<"released" | "unknown_workspace" | "not_held"> {
    const real = await namedWorkspace(this.#options.workspaceRoots, workspace);
    if (real === undefined) return "unknown_workspace";
    return await this.#inTurn(real, async () => {
      const copy = await realpath(path).catch(() => undefined);
      const held = copy === undefined ? undefined : this.#held.get(copy);
      if (copy === undefined || held === undefined || held.workspace !== real) return "not_held";
      const lease = held.leases.pop();
      if (held.leases.length === 0) this.#held.delete(copy);
      await lease?.release();
      return "released";
    });
  }

  /** The copy `path` names, as a real path, while the host holds it; `undefined` for any other path. */
  async heldCopy(path: string): Promise<HeldCopy | undefined> {
    const copy = await realpath(path).catch(() => undefined);
    const held = copy === undefined ? undefined : this.#held.get(copy);
    return copy === undefined || held === undefined
      ? undefined
      : { copy, workspace: held.workspace };
  }

  /**
   * Removes every copy and stops git. Call it when the host stops, once the
   * connectors and sessions are closed. Safe to call twice.
   */
  async close(): Promise<void> {
    this.#closed = true;
    const workspaces = [...this.#sets.keys()];
    for (const workspace of workspaces) {
      await this.#inTurn(workspace, () => this.#closeSet(workspace));
    }
  }

  async #closeSet(workspace: string): Promise<void> {
    for (const [path, held] of this.#held) {
      if (held.workspace === workspace) this.#held.delete(path);
    }
    const open = this.#sets.get(workspace);
    this.#sets.delete(workspace);
    // A set that failed to open made no copy.
    await (await open?.catch(() => undefined))?.close();
  }

  async #setOf(workspace: string): Promise<ProgramFolders> {
    let open = this.#sets.get(workspace);
    if (open === undefined) {
      open = this.#openSet(workspace);
      this.#sets.set(workspace, open);
      // A set that failed to open is tried again by the next ask.
      open.catch(() => {
        if (this.#sets.get(workspace) === open) this.#sets.delete(workspace);
      });
    }
    return await open;
  }

  async #openSet(workspace: string): Promise<ProgramFolders> {
    const { profile, digest, git, reportError } = this.#options;
    const folders = await workspaceFolders(profile, workspace, digest);
    return await openProgramFolders({
      workspaceRoot: workspace,
      copiesFolder: folders.hostProgramCopiesFolder(),
      reportError,
      ...(git === undefined ? {} : { git }),
    });
  }

  /** Runs `step` once the workspace's earlier steps are over, whether they worked or not. */
  async #inTurn<T>(workspace: string, step: () => Promise<T>): Promise<T> {
    const earlier = this.#steps.get(workspace) ?? Promise.resolve();
    const turn = earlier.catch(() => undefined).then(step);
    this.#steps.set(workspace, turn);
    try {
      return await turn;
    } finally {
      if (this.#steps.get(workspace) === turn) this.#steps.delete(workspace);
    }
  }
}

function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * The program copies for the profile folder, or `undefined` without one (no
 * program copy routes are served, and no connector starts in a copy).
 *
 * @param stopConnectors - stops every connector of a workspace, before `start` sweeps its copies
 * @param log - hears a leftover copy git couldn't sweep, as text for standard error
 */
export function hostProgramCopies(
  profile: ProfileFolder | undefined,
  workspaceRoots: readonly string[],
  stopConnectors: (workspace: string) => Promise<void>,
  log: (text: string) => void,
): HostProgramCopies | undefined {
  if (profile === undefined) return undefined;
  return new HostProgramCopies({
    profile,
    workspaceRoots,
    digest: webCryptoDigest,
    stopConnectors,
    reportError: (error) => log(`A leftover program copy couldn't be removed: ${String(error)}\n`),
  });
}
