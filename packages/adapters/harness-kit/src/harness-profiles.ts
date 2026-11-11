// The real sandbox profile builder of harness runs (HAL-189 4h, HAL-4790).
// The engine asks it for each harness call; the host gives it the trusted
// workspace, Halonic's data folder and the person's home folder. It works on
// real paths only, because the fence denies a path's real place too: a
// folder reached through a link is checked where it really is.
//
// A program in the sandbox writes only its working folder, its temp folder
// and its settings folder. With a proposal folder (`filesFolder`), the
// working folder is in that folder, so the program writes nowhere in the
// workspace. On Linux and macOS, Halonic's data folder is denied as a whole,
// and the run's own folders in it are reopened, so a folder another run makes
// there later is denied too (HAL-5644). On Windows its other entries are
// denied by name (see `#dataDenied`). The person's keys, sign-ins and their
// own harness settings in the home folder are denied as well.

import { dirname, join } from "node:path";
import type { HarnessAgent, HarnessProfile, HarnessProfileBuilder } from "@halonicjs/engine";
import type { DeniedPathGroup, DeniedPathGroupCode } from "@halonicjs/events";
import { defaultWorkingFolder, PROTECTED_TOP_NAMES } from "@halonicjs/format";
import type { HarnessBridge, SandboxBridge, SandboxProfile } from "@halonicjs/ports";
import { entriesAround, homeDeniedGroups } from "./denied-groups.ts";
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
   * @throws when the temp or settings folder is a top-level folder of
   *   Halonic's data folder, or the run's folders overlap one another
   * @throws when a folder the program needs is in a denied one, such as
   *   a harness installed in `~/.claude` on Windows
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
    refuseOverlapping([
      { name: "temp folder", path: tempFolder },
      ...(settingsFolder ? [{ name: "settings folder", path: settingsFolder }] : []),
      ...(agent.filesFolder === null ? [] : [{ name: "proposal folder", path: root }]),
    ]);
    const installPaths = await this.#installPaths(file.install, data);
    const definitionPaths = await this.#definitionPaths(root);

    // The run's own folders in the data folder. A proposal folder holds the
    // writable working folder, and a reopened path may not hold one (on
    // Linux srt would bind it back read-only over the working folder), so
    // its entries around the working folder are reopened instead. Its
    // entries are the run's own, so listing them now leaves nothing out
    // that matters. The workspace is never reopened: when it holds the data
    // folder (a workspace in the home folder), the whole data folder would
    // be readable.
    // On Windows the data folder itself isn't denied, so nothing of the run's
    // lies in a denied path and nothing is reopened.
    const writable = [tempFolder, ...(settingsFolder ? [settingsFolder] : [])];
    if (agent.filesFolder !== null) writable.unshift(workingFolder);
    const reopenedPaths =
      this.#platform === "win32"
        ? []
        : [
            ...(agent.filesFolder === null ? [] : await this.#entriesOfRoot(root, workingFolder)),
            ...writable,
          ];
    const deniedGroups: DeniedPathGroup[] = [
      ...(await homeDeniedGroups(this.#options.home, this.#platform, disk)),
      { code: "halonic-data", paths: await this.#dataDenied(data, [root, ...writable]) },
    ];
    refuseDeniedInstall(deniedGroups, installPaths);
    const needed = [...(agent.filesFolder === null ? [root] : []), workingFolder, ...writable];
    refuseDeniedHolding(deniedGroups, needed, reopenedPaths);
    // A definition path the profile denies, such as a workspace's `.halonic`
    // that is Halonic's data folder, is left out: the deny already keeps the
    // program from changing it, and on Windows naming it would grant reading it.
    const readOnlyPaths = [
      ...definitionPaths.filter(
        (path) => deniedHolding(deniedGroups, path, reopenedPaths) === null,
      ),
      ...installPaths,
    ];
    const profile: SandboxProfile = {
      workingFolder,
      tempFolder,
      settingsFolder,
      readOnlyPaths,
      deniedPaths: deniedGroups.flatMap(({ paths }) => paths),
      reopenedPaths,
      env: { ...this.#options.env, TMPDIR: tempFolder },
      network: { bridge: sandboxBridgeOf(bridge), allowedSites: [...file.allowedSites] },
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

  /**
   * The paths that deny Halonic's data folder. On Linux and macOS, the folder
   * as a whole.
   *
   * On Windows, its entries around the run's own folders, by name. A deny on
   * the data folder itself would also take the right to look at the folders
   * on the way to the run's own folders, and Node looks at each of them to
   * resolve a script's path, so no Node program could start in a run folder,
   * the fence's own probe included. What the list doesn't name is kept out
   * by the data folder's own access list: it is in the user profile, which
   * the sandbox reads only where a grant names. srt keeps a write grant on
   * each writable folder between sessions, though, and any sandboxed session
   * may read a folder with one, so a run folder that another session makes
   * and writes after this one opens stays readable (threat model 4.6, Known
   * limits).
   */
  async #dataDenied(data: string, own: readonly string[]): Promise<string[]> {
    if (this.#platform !== "win32") return [data];
    return await entriesAround(data, own, this.#disk);
  }

  /**
   * The entries of a proposal folder around its working folder, at their
   * real places. An entry that is a link out of the folder is left out, so
   * it stays denied with the rest of the data folder.
   */
  async #entriesOfRoot(root: string, workingFolder: string): Promise<string[]> {
    const entries: string[] = [];
    for (const entry of await entriesAround(root, [workingFolder], this.#disk)) {
      const real = await this.#disk.realPath(entry);
      if (isStrictlyInside(real, root) && !entries.includes(real)) entries.push(real);
    }
    return entries;
  }

  /**
   * A folder of the run's own, at its real place. It must be in Halonic's
   * data folder, and below one of its top-level folders: those are shared,
   * so a temp folder that is `runs/` itself would leave every run's files
   * writable (HAL-5675).
   */
  async #ownFolder(name: string, path: string, data: string): Promise<string> {
    let real: string;
    try {
      real = await this.#disk.realPath(path);
    } catch (error) {
      // The sandbox reopens it when the session opens, so it must be there before.
      throw new Error(`The ${name} ${path} isn't there.`, { cause: error });
    }
    if (!isStrictlyInside(real, data)) {
      throw new Error(`The ${name} ${real} must be in Halonic's data folder ${data}.`);
    }
    if (dirname(real) === data) {
      throw new Error(
        `The ${name} ${real} is a top-level folder of Halonic's data folder ${data}; it must be a folder of the run's own inside one.`,
      );
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
 * Refuses run folders that are, hold or are inside one another. The host
 * gives each one on its own, so an overlap is a host mistake, and one
 * folder would then be writable as another, such as a settings folder in
 * the proposal folder, whose files a run may save.
 */
function refuseOverlapping(folders: ReadonlyArray<{ name: string; path: string }>): void {
  for (const [index, folder] of folders.entries()) {
    const other = folders.slice(index + 1).find(({ path }) => overlaps(path, folder.path));
    if (other !== undefined) {
      throw new Error(
        `The ${folder.name} ${folder.path} overlaps the ${other.name} ${other.path}; each must be a folder of its own.`,
      );
    }
  }
}

/**
 * Refuses a harness installed in a denied folder, with what to do about
 * it. On Windows the sandbox reads a harness's install folder in the user
 * profile only when the profile names it, and a denied folder can't be
 * named: Claude Code installed in `~/.claude/local` is in the person's own
 * harness settings, which every harness run is denied (HAL-5675). The
 * wording is what happened, why, then what to do, as decided with the
 * designer in HAL-5745.
 */
function refuseDeniedInstall(
  groups: readonly DeniedPathGroup[],
  installPaths: readonly string[],
): void {
  for (const { code, paths } of groups) {
    for (const denied of paths) {
      const held = installPaths.find((path) => isInsideOrSame(path, denied));
      if (held === undefined) continue;
      const explanation = [
        `Halonic can't start the harness from \`${held}\`.`,
        `That folder is inside \`${denied}\`, which the sandbox hides from every agent${deniedBecause(code)}.`,
        `Install the harness somewhere else and run the agent again.${installExample(code)}`,
      ].join(" ");
      throw new Error(`${explanation}\nSandbox group: ${code}`);
    }
  }
}

/** Why the sandbox hides a group, in the person's terms; empty when no reason is written for it. */
function deniedBecause(code: DeniedPathGroupCode): string {
  return code === "agent-settings"
    ? " because it holds your own Claude Code or Codex settings and sign-in"
    : "";
}

/** Where a harness can go instead, for the group whose install people hit (Claude Code's `~/.claude/local`). */
function installExample(code: DeniedPathGroupCode): string {
  return code === "agent-settings"
    ? " Claude Code's native installer, for example, puts it in `.local\\bin` in your user profile."
    : "";
}

/**
 * Refuses a profile whose denied paths would hide a folder the program
 * needs, such as a workspace inside `~/.config/gcloud`: the fence would
 * deny it, and the run couldn't work.
 */
function refuseDeniedHolding(
  groups: readonly DeniedPathGroup[],
  needed: readonly string[],
  reopened: readonly string[],
): void {
  for (const path of needed) {
    const held = deniedHolding(groups, path, reopened);
    if (held !== null) {
      throw new Error(`${path} is in ${held.denied}, which the sandbox denies (${held.code}).`);
    }
  }
}

/** The denied path that hides `path`, with its group; `null` when none does, or a reopened path holds it. */
function deniedHolding(
  groups: readonly DeniedPathGroup[],
  path: string,
  reopened: readonly string[],
): { denied: string; code: DeniedPathGroup["code"] } | null {
  if (reopened.some((open) => isInsideOrSame(path, open))) return null;
  for (const { code, paths } of groups) {
    const denied = paths.find((deniedPath) => isInsideOrSame(path, deniedPath));
    if (denied !== undefined) return { denied, code };
  }
  return null;
}

/**
 * Where the sandbox lets the program reach `bridge`: the socket and the name
 * in its address when it serves a socket, otherwise the loopback host and
 * port in its address.
 */
function sandboxBridgeOf(bridge: HarnessBridge): SandboxBridge {
  const url = new URL(bridge.url);
  if (bridge.socketPath !== undefined) {
    // The sandbox's proxy sends only port 80 of the name to the socket.
    if (url.protocol !== "http:" || url.port !== "") {
      throw new Error(`The bridge's address ${bridge.url} must be plain http on port 80.`);
    }
    return { kind: "socket", name: url.hostname, socketPath: bridge.socketPath };
  }
  if (url.port === "") throw new Error(`The bridge's address ${bridge.url} names no port.`);
  const host = url.hostname.replace(/^\[(.*)\]$/, "$1");
  return { kind: "loopback", host, port: Number(url.port) };
}
