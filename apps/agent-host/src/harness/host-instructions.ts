// The instruction folders of Studio's harness runs, made in the host
// (HAL-10849). A run's `AGENTS.md` and skills are copied into a read-only
// folder in Halonic's data folder, which the sandbox opens for the program;
// the page can't write there, so it sends the texts and the host makes the
// folder and pins it, as `RunInstructions` does for the CLI.

import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import {
  type InstructionDisk,
  type InstructionFile,
  instructionDiskOnThisComputer,
  snapshotInstructions,
} from "@halonicjs/adapter-harness-kit";
import type { InstructionPin } from "@halonicjs/ports";
import { type ProfileFolder, workspaceFolders } from "@halonicjs/profile";
import { namedWorkspace } from "../server/named-workspace.ts";
import { webCryptoDigest } from "./host-profiles.ts";

/** A run's instructions folder, and the pin of what it holds. */
export interface OpenedInstructions {
  readonly folder: string;
  readonly pin: InstructionPin;
}

/** What {@link HostRunInstructions} needs to know about this computer. */
export interface HostRunInstructionsOptions {
  /** Halonic's data folder: each workspace's folders go in its harness temp folder. */
  readonly profile: ProfileFolder;
  /** The folders the launcher named as workspaces: no other folder gets instructions. */
  readonly workspaceRoots: readonly string[];
  readonly disk?: InstructionDisk;
}

/**
 * Makes the instruction folders of the workspaces the launcher named, and
 * removes them: only the folders it made, whatever path it is asked to remove.
 * What a host that stopped left is cleared the first time a workspace's
 * folders are asked for again.
 *
 * @example
 * const instructions = new HostRunInstructions({ profile, workspaceRoots });
 * const opened = await instructions.open(workspace, [{ name: "AGENTS.md", text: "Be brief.\n" }]);
 * await instructions.release(opened.folder);
 */
export class HostRunInstructions {
  readonly #options: HostRunInstructionsOptions;
  /** Each named workspace's root of instruction folders, cleared once before its first folder. */
  readonly #roots = new Map<string, Promise<string>>();
  readonly #made = new Set<string>();

  constructor(options: HostRunInstructionsOptions) {
    this.#options = options;
  }

  get #disk(): InstructionDisk {
    return this.#options.disk ?? instructionDiskOnThisComputer;
  }

  /**
   * @returns `undefined` when the folder isn't one the launcher named as a workspace
   * @throws when a name isn't `AGENTS.md` or a skill's `SKILL.md`, or the files can't be written
   */
  async open(
    workspace: string,
    files: readonly InstructionFile[],
  ): Promise<OpenedInstructions | undefined> {
    const real = await namedWorkspace(this.#options.workspaceRoots, workspace);
    if (real === undefined) return undefined;
    const snapshot = await snapshotInstructions(await this.#rootOf(real), files, this.#disk);
    this.#made.add(snapshot.folder);
    return snapshot;
  }

  /** Removes a folder this host made; any other path is left alone. It doesn't throw. */
  async release(folder: string): Promise<void> {
    if (!this.#made.delete(folder)) return;
    await this.#disk.removeFolder(folder).catch(() => undefined);
  }

  /** Removes every folder this host made, when the host stops. */
  async stop(): Promise<void> {
    await Promise.all([...this.#made].map((folder) => this.release(folder)));
  }

  #rootOf(workspace: string): Promise<string> {
    let root = this.#roots.get(workspace);
    if (root === undefined) {
      root = this.#clearedRoot(workspace);
      this.#roots.set(workspace, root);
      // A root that couldn't be cleared is tried again by the next ask.
      root.catch(() => this.#roots.delete(workspace));
    }
    return root;
  }

  async #clearedRoot(workspace: string): Promise<string> {
    const folders = await workspaceFolders(this.#options.profile, workspace, webCryptoDigest);
    const root = join(folders.harnessTempFolder(), "instructions");
    // Nothing in it is this host's yet: it is what a host that stopped left.
    await this.#disk.removeFolder(root);
    await mkdir(root, { recursive: true, mode: 0o700 });
    return root;
  }
}

/**
 * The instruction folders in the profile folder, or `undefined` without one
 * (no instruction route is served).
 */
export function hostRunInstructions(
  profile: ProfileFolder | undefined,
  workspaceRoots: readonly string[],
): HostRunInstructions | undefined {
  if (profile === undefined) return undefined;
  return new HostRunInstructions({ profile, workspaceRoots });
}
