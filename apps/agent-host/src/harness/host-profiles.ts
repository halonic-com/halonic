// The harness profile builder, run in the host (HAL-10849). The profile reads
// and makes folders on disk and resolves links, so it needs Node and sits
// next to the sandbox; Studio's page asks for it over loopback and gets the
// finished `SandboxProfile` back to open a session with.

import { homedir } from "node:os";
import {
  type HarnessInstall,
  HarnessProfiles,
  programEnvironment,
  WorkspaceHarnessHost,
} from "@halonicjs/adapter-harness-kit";
import type { HarnessAgent, HarnessProfile, ProgramHarness } from "@halonicjs/engine";
import { SCHEMA_VERSION } from "@halonicjs/format";
import type { Digest, Harness, HarnessBridge, Sandbox, SandboxProfile } from "@halonicjs/ports";
import { type ProfileFolder, workspaceFolders } from "@halonicjs/profile";
import { namedWorkspace } from "../server/named-workspace.ts";

/**
 * How long one harness call may last before the sandbox stops its program,
 * in milliseconds: half an hour, as the CLI's.
 */
export const harnessCallLimitMs = 30 * 60_000;

/** What Studio says about the agent; the host adds everything else. */
export interface ProfileAgent {
  readonly runId: string;
  readonly hubId: string;
  readonly agentId: string;
  readonly harness: ProgramHarness;
  /** The working folder the agent's file names, relative to the workspace; `null` for the default. */
  readonly workingFolder: string | null;
  readonly allowedSites: readonly string[];
  /** The run's proposal folder, or `null` for the workspace itself. */
  readonly filesFolder: string | null;
}

/** What {@link HostHarnessProfiles} needs to know about this computer. */
export interface HostHarnessProfilesOptions {
  /** Halonic's data folder: denied to every program but for the run's own folders. */
  readonly profile: ProfileFolder;
  /** The folders the launcher named as workspaces: no other folder gets a profile. */
  readonly workspaceRoots: readonly string[];
  readonly harnesses: readonly Harness[];
  /** The person's home folder, where the denied groups are found. */
  readonly home: string;
  /** The variables every harness program gets. */
  readonly env: Readonly<Record<string, string>>;
  readonly digest: Digest;
  /** The system, as `process.platform` names it. */
  readonly platform: NodeJS.Platform;
  /**
   * How a harness starts on this computer, which the profile builder reads
   * only on Windows. Left out, the host's own: on Windows it refuses (see
   * {@link installOf}).
   */
  readonly installOf?: (harness: string) => Promise<HarnessInstall>;
  /**
   * How long a built profile may wait for its session to open before its
   * temp folder is removed, in milliseconds. Ten minutes when left out.
   */
  readonly unopenedAfterMs?: number;
  /** Hears a temp folder that couldn't be removed when its session closed. */
  readonly onLeftoverTempFolder: (folder: string, error: unknown) => void;
}

/**
 * Builds harness profiles for the workspaces the launcher named, and removes
 * each session's temp folder when the session closes.
 *
 * @example
 * const profiles = new HostHarnessProfiles(options);
 * const sandbox = profiles.removingTempFolders(srt);
 * const built = await profiles.profileOf(workspace, agent, bridge, null);
 */
export class HostHarnessProfiles {
  readonly #options: HostHarnessProfilesOptions;
  readonly #byWorkspace = new Map<string, Promise<WorkspaceProfiles>>();
  /** The hosts made so far; a session's temp folder is removed by the one that made it. */
  readonly #hosts: WorkspaceHarnessHost[] = [];
  /** The profiles built whose session hasn't opened yet, by temp folder, with the timer that removes it. */
  readonly #unopened = new Map<string, NodeJS.Timeout>();

  constructor(options: HostHarnessProfilesOptions) {
    this.#options = options;
  }

  /**
   * @returns `undefined` when the folder isn't one the launcher named as a workspace
   * @throws when the profile can't be built (see `HarnessProfiles.profileOf`)
   */
  async profileOf(
    workspace: string,
    agent: ProfileAgent,
    bridge: HarnessBridge,
    instructionsFolder: string | null,
  ): Promise<HarnessProfile | undefined> {
    const real = await namedWorkspace(this.#options.workspaceRoots, workspace);
    if (real === undefined) return undefined;
    const { profiles } = await this.#profilesOf(real);
    const built = await profiles.profileOf(harnessAgentOf(agent), bridge, instructionsFolder);
    this.#removeIfUnopened(built.profile);
    return built;
  }

  /**
   * The agent's own settings folder for its harness in the workspace, made
   * and private, where Studio checks and opens its sign-in (HAL-6351).
   *
   * @returns `undefined` when the folder isn't one the launcher named as a
   * workspace, and `null` when the harness has no sign-in of its own
   * @throws RangeError when the agent's id can't name a folder safely
   */
  async settingsFolderOf(
    workspace: string,
    agentId: string,
    harness: ProgramHarness,
  ): Promise<string | null | undefined> {
    const real = await namedWorkspace(this.#options.workspaceRoots, workspace);
    if (real === undefined) return undefined;
    const { host } = await this.#profilesOf(real);
    return host.agentSettingsFolder(agentId, harness);
  }

  /**
   * The sandbox, whose sessions remove the temp folder a profile of this host
   * made for them once they close. A profile's temp folder that no host here
   * made is never removed.
   */
  removingTempFolders(sandbox: Sandbox): Sandbox {
    // The chain is made at each open, so a workspace's host that came later is in it too.
    const wrapped = () =>
      this.#hosts.reduce((inner, host) => host.removingTempFolders(inner), sandbox);
    return {
      check: () => sandbox.check(),
      capabilities: () => sandbox.capabilities(),
      open: (profile, options) => {
        this.#opening(profile);
        return wrapped().open(profile, options);
      },
    };
  }

  /** A profile whose session never opens (its run was cancelled in between, say) gets its temp folder removed after a while. */
  #removeIfUnopened(profile: SandboxProfile): void {
    const timer = setTimeout(
      () => {
        this.#unopened.delete(profile.tempFolder);
        for (const host of this.#hosts) void host.removeTempFolderOf(profile);
      },
      this.#options.unopenedAfterMs ?? 10 * 60_000,
    );
    timer.unref();
    this.#unopened.set(profile.tempFolder, timer);
  }

  /** The session is opening, so it removes its own temp folder when it closes. */
  #opening(profile: SandboxProfile): void {
    clearTimeout(this.#unopened.get(profile.tempFolder));
    this.#unopened.delete(profile.tempFolder);
  }

  /** The workspace's builder and its host, made on the first ask, however many ask together. */
  #profilesOf(workspace: string): Promise<WorkspaceProfiles> {
    let made = this.#byWorkspace.get(workspace);
    if (made === undefined) {
      made = this.#make(workspace);
      this.#byWorkspace.set(workspace, made);
      // A failed make is tried again by the next ask.
      made.catch(() => this.#byWorkspace.delete(workspace));
    }
    return made;
  }

  async #make(workspace: string): Promise<WorkspaceProfiles> {
    const { profile, harnesses, home, env, digest, platform } = this.#options;
    const folders = await workspaceFolders(profile, workspace, digest);
    const host = new WorkspaceHarnessHost({
      settingsFolders: folders,
      tempRoot: folders.harnessTempFolder(),
      harnesses: programHarnesses(harnesses),
      installOf: this.#options.installOf ?? ((harness) => installOf(harness, platform)),
      onLeftoverTempFolder: this.#options.onLeftoverTempFolder,
    });
    const profiles = new HarnessProfiles({
      workspace,
      halonicData: profile.root,
      home,
      host,
      env,
      timeLimitMs: harnessCallLimitMs,
      platform,
    });
    this.#hosts.push(host);
    return { profiles, host };
  }
}

/** One workspace's profile builder, and the host it builds on. */
interface WorkspaceProfiles {
  readonly profiles: HarnessProfiles;
  readonly host: WorkspaceHarnessHost;
}

/** The harnesses by id, as the profile host reads their sign-in. */
function programHarnesses(harnesses: readonly Harness[]): Partial<Record<ProgramHarness, Harness>> {
  const byId: Partial<Record<ProgramHarness, Harness>> = {};
  for (const harness of harnesses) {
    const id = programHarnessOf(harness.id);
    if (id !== undefined) byId[id] = harness;
  }
  return byId;
}

/** The program harness with this id, or `undefined` for any other name. */
export function programHarnessOf(id: string): ProgramHarness | undefined {
  return id === "claude-code" || id === "codex" ? id : undefined;
}

/**
 * How a harness starts here, which the profile builder reads only on
 * Windows. Finding where Windows installed it isn't built yet, so a harness
 * run there stops with that reason instead of running with a guess.
 */
async function installOf(harness: string, platform: NodeJS.Platform): Promise<HarnessInstall> {
  if (platform === "win32") {
    throw new Error(
      `Halonic can't find where ${harness} is installed on Windows yet, so the agent host can't run it in the sandbox.`,
    );
  }
  return { program: harness, packageFolder: null };
}

/**
 * The engine's view of the agent that the profile builder reads: its ids, its
 * harness, its working folder and sites, and its proposal folder. The rest of
 * the agent's file is what a default file holds; the builder never reads it.
 */
function harnessAgentOf(agent: ProfileAgent): HarnessAgent {
  return {
    runId: agent.runId,
    hubId: agent.hubId,
    agentId: agent.agentId,
    harness: agent.harness,
    version: null,
    filesFolder: agent.filesFolder,
    file: {
      version: SCHEMA_VERSION,
      id: agent.agentId,
      name: agent.agentId,
      params: {},
      instructions: "",
      skills: [],
      knowledge: [],
      connectors: [],
      runLogs: false,
      collections: [],
      subagents: [],
      methods: {},
      output: { type: "text" },
      maxSteps: 6,
      harness: agent.harness,
      ...(agent.workingFolder === null ? {} : { workingFolder: agent.workingFolder }),
      allowedSites: [...agent.allowedSites],
    },
  };
}

/**
 * The harness profile builder for the profile folder, on this computer, or
 * `undefined` without one (no profile route is served).
 *
 * @param log - hears what can't be removed, as text for standard error
 */
export function hostHarnessProfiles(
  profile: ProfileFolder | undefined,
  workspaceRoots: readonly string[],
  harnesses: readonly Harness[],
  log: (text: string) => void,
): HostHarnessProfiles | undefined {
  if (profile === undefined) return undefined;
  return new HostHarnessProfiles({
    profile,
    workspaceRoots,
    harnesses,
    home: homedir(),
    env: programEnvironment(process.env),
    digest: webCryptoDigest,
    platform: process.platform,
    onLeftoverTempFolder: (folder, error) =>
      log(`A harness temp folder couldn't be removed (${folder}): ${String(error)}\n`),
  });
}

/** The Web Crypto API that Node has, as the {@link Digest} port. */
export const webCryptoDigest: Digest = {
  async sha256(data) {
    return new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(data)));
  },
};
