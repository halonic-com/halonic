// The real sandbox profile builder of harness runs (HAL-189 4h, HAL-4790).
// The engine asks it for each harness call; the host gives it the trusted
// workspace, Halonic's data folder and the person's home folder. It works on
// real paths only, because the fence denies a path's real place too: a
// folder reached through a link is checked where it really is.
//
// A program in the sandbox writes only its working folder, its temp folder
// and its settings folder. With a proposal folder (`filesFolder`), the
// working folder is in that folder, so the program writes nowhere in the
// workspace. Halonic's data folder is denied, except the run's own folders
// in it, and so are the person's keys, sign-ins and their own harness
// settings in the home folder.

import { join } from "node:path";
import type { HarnessAgent, HarnessProfile, HarnessProfileBuilder } from "@halonicjs/engine";
import type { DeniedPathGroup } from "@halonicjs/events";
import { defaultWorkingFolder, PROTECTED_TOP_NAMES } from "@halonicjs/format";
import type { HarnessBridge, SandboxProfile } from "@halonicjs/ports";
import { hiddenAround, homeDeniedGroups } from "./denied-groups.ts";
import { type HarnessInstall, windowsInstallReadPaths } from "./install-folders.ts";
import {
  isInsideOrSame,
  isStrictlyInside,
  overlaps,
  type ProfileDisk,
  profileDiskOnThisComputer,
  realWorkingFolder,
} from "./working-folder.ts";

/** What the agent's file says about where its harness may write and reach. */
export interface HarnessAgentFile {
  /** The working folder as the file names it, relative to the workspace; `null` for the default. */
  readonly workingFolder: string | null;
  /** The sites the file allows, already checked by the format. */
  readonly allowedSites: readonly string[];
  /** How the agent's harness starts on this computer; only read on Windows. */
  readonly install: HarnessInstall;
}

/** The host's side of the builder: the agent's file, and the run's own folders. */
export interface HarnessProfileHost {
  /** The file of the agent, as the run reads it. */
  agentFile(agent: HarnessAgent): Promise<HarnessAgentFile>;
  /** A fresh, empty, private temp folder for one sandbox session, in Halonic's data folder. */
  tempFolder(agent: HarnessAgent): Promise<string>;
  /** The agent's own settings folder in Halonic's data folder; `null` when its harness needs none. */
  settingsFolder(agent: HarnessAgent): Promise<string | null>;
}

/** What the builder needs to know about this computer. Every path is absolute. */
export interface HarnessProfilesOptions {
  /** The trusted workspace. */
  readonly workspace: string;
  /** Halonic's data folder, denied but for the run's own folders. It is made when it isn't there. */
  readonly halonicData: string;
  /** The person's home folder, where the denied groups are found. */
  readonly home: string;
  readonly host: HarnessProfileHost;
  /** The variables every harness program gets, such as `PATH` and the locale; the builder adds `TMPDIR`. */
  readonly env: Readonly<Record<string, string>>;
  /** How long a harness call may last, in milliseconds. */
  readonly timeLimitMs: number;
  /** The system, as `process.platform` names it. */
  readonly platform?: NodeJS.Platform;
  readonly disk?: ProfileDisk;
}

/**
 * Builds each harness call's sandbox profile on this computer's disk.
 *
 * @example
 * const profiles = new HarnessProfiles({ workspace, halonicData, home, host, env, timeLimitMs });
 * localEngine({ ...options, harnesses: { ...harnesses, profiles } });
 */
export class HarnessProfiles implements HarnessProfileBuilder {
  readonly #options: HarnessProfilesOptions;
  readonly #platform: NodeJS.Platform;
  readonly #disk: ProfileDisk;

  constructor(options: HarnessProfilesOptions) {
    this.#options = options;
    this.#platform = options.platform ?? process.platform;
    this.#disk = options.disk ?? profileDiskOnThisComputer;
  }

  /**
   * @throws when the working folder leaves the workspace or the proposal
   *   folder, or is in `.git`, a definition folder or Halonic's data folder
   * @throws when a folder the program needs is in a denied one
   */
  async profileOf(agent: HarnessAgent, bridge: HarnessBridge): Promise<HarnessProfile> {
    const { host } = this.#options;
    const disk = this.#disk;
    await disk.makeFolder(this.#options.halonicData);
    const data = await disk.realPath(this.#options.halonicData);
    const workspace = await disk.realPath(this.#options.workspace);
    const root = await this.#rootOf(agent, workspace, data);
    const file = await host.agentFile(agent);
    const workingFolder = await realWorkingFolder(
      root,
      file.workingFolder ?? defaultWorkingFolder(agent.agentId),
      disk,
    );
    if (agent.filesFolder === null && overlaps(workingFolder, data)) {
      throw new Error(
        `The working folder ${workingFolder} overlaps Halonic's data folder ${data}.`,
      );
    }
    const tempFolder = await this.#ownFolder("temp folder", await host.tempFolder(agent), data);
    const named = await host.settingsFolder(agent);
    const settingsFolder =
      named === null ? null : await this.#ownFolder("settings folder", named, data);
    const readOnlyPaths = [
      ...(await this.#definitionPaths(root)),
      ...(await this.#installPaths(file.install, data)),
    ];

    // Only a proposal folder is kept as a whole. The workspace isn't: when it
    // holds the data folder (a workspace in the home folder), keeping it
    // would leave the whole data folder readable.
    const keptRoot = agent.filesFolder === null ? [] : [root];
    const kept = [
      ...keptRoot,
      workingFolder,
      tempFolder,
      ...(settingsFolder ? [settingsFolder] : []),
    ];
    const deniedGroups: DeniedPathGroup[] = [
      ...(await homeDeniedGroups(this.#options.home, this.#platform, disk)),
      { code: "halonic-data", paths: await hiddenAround(data, kept, disk) },
    ];
    refuseDeniedHolding(deniedGroups, [root, ...kept, ...readOnlyPaths]);
    const profile: SandboxProfile = {
      workingFolder,
      tempFolder,
      settingsFolder,
      readOnlyPaths,
      deniedPaths: deniedGroups.flatMap(({ paths }) => paths),
      env: { ...this.#options.env, TMPDIR: tempFolder },
      network: { bridge: bridgeAddress(bridge), allowedSites: [...file.allowedSites] },
      timeLimitMs: this.#options.timeLimitMs,
    };
    return { profile, deniedGroups };
  }

  /** The real folder the agent works in: the workspace, or its run's proposal folder in Halonic's data. */
  async #rootOf(agent: HarnessAgent, workspace: string, data: string): Promise<string> {
    if (agent.filesFolder === null) return workspace;
    const folder = await this.#disk.realPath(agent.filesFolder);
    if (!isStrictlyInside(folder, data) || overlaps(folder, workspace)) {
      throw new Error(
        `Run ${agent.runId}'s proposal folder ${folder} must be in Halonic's data folder and outside the workspace.`,
      );
    }
    return folder;
  }

  /** A folder of the run's own, which must be in Halonic's data folder, at its real place. */
  async #ownFolder(name: string, path: string, data: string): Promise<string> {
    const real = await this.#disk.realPath(path);
    if (!isStrictlyInside(real, data)) {
      throw new Error(`The ${name} ${real} must be in Halonic's data folder ${data}.`);
    }
    return real;
  }

  /** The definition files and folders at the top of `root`, read-only, where they are. */
  async #definitionPaths(root: string): Promise<string[]> {
    const paths: string[] = [];
    for (const name of PROTECTED_TOP_NAMES) {
      try {
        paths.push(await this.#disk.realPath(join(root, name)));
      } catch {
        // Not in this workspace: nothing to protect.
      }
    }
    return paths;
  }

  /** On Windows, the harness's install folders in the user profile, which the sandbox reads only when named. */
  async #installPaths(install: HarnessInstall, data: string): Promise<string[]> {
    if (this.#platform !== "win32") return [];
    const folders = { userProfile: this.#options.home, halonicData: data };
    return await windowsInstallReadPaths(install, folders, this.#disk.realPath);
  }
}

/**
 * Refuses a profile whose denied paths would hide a folder the program
 * needs, such as a workspace inside `~/.config/gcloud`: the fence would
 * deny it, and the run couldn't work.
 */
function refuseDeniedHolding(groups: readonly DeniedPathGroup[], needed: readonly string[]): void {
  for (const { code, paths } of groups) {
    for (const denied of paths) {
      const held = needed.find((path) => isInsideOrSame(path, denied));
      if (held !== undefined) {
        throw new Error(`${held} is in ${denied}, which the sandbox denies (${code}).`);
      }
    }
  }
}

/** The bridge's loopback host and port, from its address. */
function bridgeAddress(bridge: HarnessBridge): { host: string; port: number } {
  const url = new URL(bridge.url);
  if (url.port === "") throw new Error(`The bridge's address ${bridge.url} names no port.`);
  return { host: url.hostname.replace(/^\[(.*)\]$/, "$1"), port: Number(url.port) };
}
