// The host's side of the harness profile builder, as the apps share it
// (HAL-6209): the agent's file comes from what the engine asks with, and the
// run's own folders are made in Halonic's data folder, private to the user.
//
// The settings folder belongs to the agent and its harness, and stays: the
// agent's own sign-in lives there. The temp folder belongs to one sandbox
// session, and goes when the session closes. The engine doesn't tell the
// host when that is, so the host wraps each sandbox the engine is given.

import { mkdtemp, realpath, rm } from "node:fs/promises";
import { join } from "node:path";
import { makePrivateFolder } from "@halonicjs/adapter-fs-node";
import type { HarnessAgent, ProgramHarness } from "@halonicjs/engine";
import type { Harness, Sandbox, SandboxProfile, SandboxSession } from "@halonicjs/ports";
import type { HarnessAgentFile, HarnessProfileHost } from "./harness-profiles.ts";
import type { HarnessInstall } from "./install-folders.ts";

/** Where an agent's settings folder is in the profile. */
export interface HarnessSettingsFolders {
  /**
   * The agent's settings folder for one harness, such as
   * `<profile>/workspaces/<key>/harness-settings/<agentId>/<harnessId>`, as
   * `workspaceFolders(…).harnessSettingsFolder` gives it (HAL-6169). Nothing
   * is made.
   */
  harnessSettingsFolder(agentId: string, harnessId: string): string;
}

/** What the host makes and removes on disk. */
export interface ProfileHostDisk {
  /** Makes a folder and the folders on its way, only the user's; a folder that is there already is made private. */
  makePrivateFolder(path: string): Promise<void>;
  /** Makes a new, empty folder only the user's, named `prefix` and a random end, and gives its path. */
  makeFreshPrivateFolder(prefix: string): Promise<string>;
  /** The path with every link on it resolved. */
  realPath(path: string): Promise<string>;
  /** Removes a folder and everything in it; a folder that isn't there is fine. */
  removeFolder(path: string): Promise<void>;
}

/** This computer's disk. */
export const profileHostDiskOnThisComputer: ProfileHostDisk = {
  makePrivateFolder,
  // `mkdtemp` makes the folder with mode 700. On Windows the mode means
  // nothing; the profile folder's own permissions protect it there.
  makeFreshPrivateFolder: (prefix) => mkdtemp(prefix),
  realPath: (path) => realpath(path),
  async removeFolder(path) {
    // A program that has just ended can still hold a file on Windows for a moment.
    await rm(path, { recursive: true, force: true, maxRetries: 3 });
  },
};

/** What {@link WorkspaceHarnessHost} needs to know about this computer. */
export interface WorkspaceHarnessHostOptions {
  readonly settingsFolders: HarnessSettingsFolders;
  /**
   * The folder each sandbox session's temp folder is made in, inside
   * Halonic's data folder; made when it isn't there.
   */
  readonly tempRoot: string;
  /** The harnesses the host offers, by their `id`, as the engine is given them. */
  readonly harnesses: Readonly<Partial<Record<ProgramHarness, Harness>>>;
  /** How the harness starts on this computer; the profile builder reads it only on Windows. */
  installOf(harness: ProgramHarness): Promise<HarnessInstall>;
  /** Hears a temp folder that couldn't be removed when its session closed. */
  readonly onLeftoverTempFolder?: (folder: string, error: unknown) => void;
  readonly disk?: ProfileHostDisk;
}

/**
 * The host's side of the harness profile builder, for one workspace
 * (requirement `harness-kit.profile-host`). Pass it to `HarnessProfiles`,
 * and wrap the engine's sandboxes with {@link removingTempFolders}, so each
 * session's temp folder goes when the session closes.
 *
 * @example
 * const folders = await workspaceFolders(profile, workspace, digest);
 * const host = new WorkspaceHarnessHost({ settingsFolders: folders, tempRoot, harnesses, installOf });
 * const profiles = new HarnessProfiles({ workspace, halonicData, home, host, env, timeLimitMs });
 * const sandboxes = { sandbox: host.removingTempFolders(fenced), "this-computer": host.removingTempFolders(launcher) };
 */
export class WorkspaceHarnessHost implements HarnessProfileHost {
  readonly #options: WorkspaceHarnessHostOptions;
  readonly #disk: ProfileHostDisk;
  /** The temp folders this host made and no closed session has removed yet, at their real place. */
  readonly #tempFolders = new Set<string>();

  constructor(options: WorkspaceHarnessHostOptions) {
    this.#options = options;
    this.#disk = options.disk ?? profileHostDiskOnThisComputer;
  }

  /** The working folder and the sites from the agent's file as the call read it, and how its harness starts here. */
  async agentFile(agent: HarnessAgent): Promise<HarnessAgentFile> {
    return {
      workingFolder: agent.file.workingFolder ?? null,
      allowedSites: agent.file.allowedSites ?? [],
      install: await this.#options.installOf(agent.harness),
    };
  }

  /** A new, empty, private folder in {@link WorkspaceHarnessHostOptions.tempRoot}, at its real place. */
  async tempFolder(_agent: HarnessAgent): Promise<string> {
    const { tempRoot } = this.#options;
    await this.#disk.makePrivateFolder(tempRoot);
    const made = await this.#disk.makeFreshPrivateFolder(join(tempRoot, "session-"));
    const folder = await this.#disk.realPath(made);
    this.#tempFolders.add(folder);
    return folder;
  }

  /**
   * The agent's settings folder for its harness, made and private; `null`
   * when the harness has no folder variable to point its program at one,
   * as Halonic's own loop.
   */
  async settingsFolder(agent: HarnessAgent): Promise<string | null> {
    if (this.#options.harnesses[agent.harness]?.signIn === undefined) return null;
    const folder = this.#options.settingsFolders.harnessSettingsFolder(
      agent.agentId,
      agent.harness,
    );
    await this.#disk.makePrivateFolder(folder);
    return folder;
  }

  /**
   * The sandbox, whose sessions remove the temp folder this host made for
   * them once they close. A session that fails to open removes it at once.
   * A profile's temp folder that this host didn't make is never removed.
   */
  removingTempFolders(sandbox: Sandbox): Sandbox {
    return {
      check: () => sandbox.check(),
      capabilities: () => sandbox.capabilities(),
      open: async (profile, options) => {
        let session: SandboxSession;
        try {
          session = await sandbox.open(profile, options);
        } catch (error) {
          await this.#removeTempFolderOf(profile);
          throw error;
        }
        return closingWith(session, () => this.#removeTempFolderOf(profile));
      },
    };
  }

  /** Removes the profile's temp folder when this host made it. Never throws. */
  async #removeTempFolderOf(profile: SandboxProfile): Promise<void> {
    const folder = profile.tempFolder;
    if (!this.#tempFolders.delete(folder)) return;
    try {
      await this.#disk.removeFolder(folder);
    } catch (error) {
      this.#options.onLeftoverTempFolder?.(folder, error);
    }
  }
}

/** The session, which runs `afterClose` once it has closed, however often it is closed. */
function closingWith(session: SandboxSession, afterClose: () => Promise<void>): SandboxSession {
  let closed: Promise<void> | undefined;
  return {
    get profile() {
      return session.profile;
    },
    get fence() {
      return session.fence;
    },
    start: (command) => session.start(command),
    onBlocked: (listener) => session.onBlocked(listener),
    close() {
      closed ??= session.close().finally(afterClose);
      return closed;
    },
  };
}
