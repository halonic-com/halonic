// What the CLI's engine runs agents in harnesses with (HAL-7747): the Node
// parts of `harnessHostOf` (`@halonicjs/host-harness-host`), which takes
// ports only. The fenced srt sandbox and the unfenced launcher, the Node
// bridge server, the harness profile builder, git with its worktrees in the
// workspace's folder in the profile, and the agents' files on disk.
//
// Nothing starts until a harness run needs it: git starts at the first
// worktree, so an engine that runs no harness agent never needs git, and the
// sandbox is only asked when a call opens a session. Like the rest of the
// engine's folders, this is a plain function of its inputs and never reads
// the CLI's printer, argv or `process`'s streams.

import { readdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import {
  FileAgentPlacementStore,
  FolderDefinitionStore,
  FolderRunCopies,
  FolderTrash,
  makePrivateFolder,
} from "@halonicjs/adapter-fs-node";
import type { GitRunnerOptions } from "@halonicjs/adapter-git";
import { NodeHarnessBridgeServer } from "@halonicjs/adapter-harness-bridge";
import { claudeCodeHarness } from "@halonicjs/adapter-harness-claude-code";
import { codexHarness } from "@halonicjs/adapter-harness-codex";
import {
  type HarnessInstall,
  HarnessProfiles,
  WorkspaceHarnessHost,
} from "@halonicjs/adapter-harness-kit";
import { createHostSandbox, createProgramProbe } from "@halonicjs/adapter-sandbox-host";
import { SrtSandbox } from "@halonicjs/adapter-sandbox-srt";
import type { HarnessRunsOptions } from "@halonicjs/engine";
import {
  type AgentFiles,
  type BridgeServices,
  type HarnessHost,
  harnessHostOf,
  refusingApprovals,
} from "@halonicjs/host-harness-host";
import type {
  Clock,
  DefinitionStore,
  Digest,
  HarnessBridgeServer,
  Secrets,
} from "@halonicjs/ports";
import type { ProfileEnvironment, ProfileFolder, WorkspaceFolders } from "@halonicjs/profile";
import { filesOf, type LoadedWorkspace } from "@halonicjs/workspace";
import { lazyProposalGit } from "./lazy-proposal-git.ts";
import { placementFolder } from "./sandbox-gate-machine.ts";
import { privateJournalFolder } from "./sandbox-journals.ts";
import { halonicVersion } from "./version.ts";
import type { WorkspaceVersions } from "./workspace-versions.ts";

/**
 * How long one harness call may last before the sandbox stops its program,
 * in milliseconds: half an hour, as long as a coding agent's task may take
 * and short enough that a stuck program doesn't hold a terminal for a day.
 */
export const harnessCallLimitMs = 30 * 60_000;

/** The folder in the profile where each run's bridge serves its Unix socket, as the agent host's. */
const bridgeSocketsFolder = "bridges";

/**
 * The Node parts a test replaces. Each one left out is this computer's: the
 * srt sandbox, the launcher, Claude Code and Codex, and a bridge on Node's
 * own `http`.
 */
export interface LocalHarnessParts {
  /** The fenced sandbox, for agents that run in `sandbox`. */
  readonly fenced?: HarnessRunsOptions["sandboxes"]["sandbox"];
  /** The launcher's unfenced session, for agents the person set to "On this computer". */
  readonly launcher?: HarnessRunsOptions["sandboxes"]["this-computer"];
  /** The harnesses, by their `id`. */
  readonly harnesses?: HarnessRunsOptions["harnesses"];
  /** Opens each run's bridge; Node's, which reads no secret, by default. */
  readonly bridgeServer?: HarnessBridgeServer;
  /** The system the CLI runs on; `process.platform` by default. */
  readonly platform?: NodeJS.Platform;
  /** The variables every harness program gets; `PATH` and the locale from `process.env` by default. */
  readonly programEnvironment?: Readonly<Record<string, string>>;
}

/** What {@link openLocalHarnessHost} builds from. */
export interface LocalHarnessInput {
  /** The workspace folder's real path: the choices in the profile are keyed by it. */
  readonly location: string;
  /** The workspace's folders in the profile. */
  readonly folders: WorkspaceFolders;
  readonly profile: ProfileFolder;
  readonly environment: ProfileEnvironment;
  /** The files the engine runs, read when a run starts, for where an agent runs and its folders. */
  workspace(): LoadedWorkspace;
  /**
   * The files a run read, when runs start from other versions than the
   * files on disk (`routines watch`): the placement check hashes the
   * agent's file from the run's version. Without it, from disk.
   */
  readonly versions?: Pick<WorkspaceVersions, "agentFileOf">;
  /** The workspace's files, which Accept writes (not wired yet) and a proposal's base is read from. */
  readonly store: DefinitionStore;
  readonly digest: Digest;
  readonly clock: Clock;
  /** Which git makes the worktrees; the one on the `PATH` by default. */
  readonly git?: GitRunnerOptions;
  /** The runs the engine hasn't ended, whose folders stay at `start`; read only when a folder is left from before. */
  openRuns(): Promise<ReadonlySet<string>>;
  /** Hears the error of a folder's end that couldn't finish, and of a temp folder that couldn't be removed. */
  reportError(error: unknown): void;
  readonly parts?: LocalHarnessParts;
}

/** The harness host, open until {@link LocalHarnessHost.close}. */
export interface LocalHarnessHost extends Omit<HarnessHost, "start"> {
  /**
   * Clears what runs that ended while no engine was open left in the profile.
   * Call it once, under the engine lock, before the engine starts any run.
   * It never throws: an error goes to `reportError`, and the next start tries again.
   */
  start(): Promise<void>;
  /** Stops git, if it started. Close it once the executor and the scheduler have closed. Safe to call twice. */
  close(): Promise<void>;
}

/**
 * Builds the CLI's harness host for the workspace. Call it only while
 * holding the workspace's engine lock: it empties what a stopped engine left
 * in the folder for the sessions' temp folders.
 *
 * @throws when a folder in the profile can't be made or emptied
 */
export async function openLocalHarnessHost(input: LocalHarnessInput): Promise<LocalHarnessHost> {
  const { folders, profile } = input;
  const parts = input.parts ?? {};
  const platform = parts.platform ?? process.platform;
  const tempRoot = folders.harnessTempFolder();
  await makePrivateFolder(profile.root);
  await emptyFolder(tempRoot);
  await makePrivateFolder(folders.proposalRecordsFolder());

  const harnesses = parts.harnesses ?? nodeHarnesses();
  const host = new WorkspaceHarnessHost({
    settingsFolders: folders,
    tempRoot,
    harnesses,
    installOf: (harness) => installOf(harness, platform),
    onLeftoverTempFolder: (_folder, error) => input.reportError(error),
  });
  const profiles = new HarnessProfiles({
    workspace: input.location,
    // The whole profile folder: the run's own folders in it are the only ones reopened.
    halonicData: profile.root,
    home: input.environment.homeFolder,
    host,
    env: parts.programEnvironment ?? programEnvironment(process.env),
    timeLimitMs: harnessCallLimitMs,
    platform,
  });
  const fenced =
    parts.fenced ??
    new SrtSandbox(undefined, undefined, privateJournalFolder(profile), {
      sweepRoots: [tempRoot, folders.proposalWorktreesFolder(), folders.runCopiesFolder()],
    });
  const git = lazyProposalGit({
    location: input.location,
    worktrees: folders.proposalWorktreesFolder(),
    ...(input.git === undefined ? {} : { git: input.git }),
  });
  const built = harnessHostOf({
    sandboxes: {
      sandbox: host.removingTempFolders(fenced),
      "this-computer": host.removingTempFolders(parts.launcher ?? createHostSandbox()),
    },
    harnesses,
    bridgeServer: parts.bridgeServer ?? (await nodeBridgeServer(input)),
    services: { servicesFor: () => bridgeServices },
    profiles,
    home: input.environment.homeFolder,
    placement: {
      store: new FileAgentPlacementStore(placementFolder(profile)),
      location: input.location,
      files: agentFilesOf(input),
    },
    digest: input.digest,
    clock: input.clock,
    proposals: {
      vcs: git.vcs,
      // With history off, a run that writes files works in a plain copy of the saved files.
      copies: new FolderRunCopies(folders.runCopiesFolder()),
      records: new FolderDefinitionStore(folders.proposalRecordsFolder()),
      store: input.store,
      trash: new FolderTrash({
        folder: folders.trashFolder(),
        store: input.store,
        digest: input.digest,
      }),
      onEndFailed: (_runId, error) => input.reportError(error),
    },
  });
  const kept = [
    folders.proposalRecordsFolder(),
    folders.proposalWorktreesFolder(),
    folders.runCopiesFolder(),
  ];
  return {
    ...built,
    // Nothing kept means nothing to clear, so git isn't started for a workspace that never ran a harness agent.
    start: async () => {
      if (await allEmpty(kept)) return;
      try {
        await built.start(await input.openRuns());
      } catch (error) {
        // Clean-up only: the engine opens all the same, and the next one tries again.
        input.reportError(error);
      }
    },
    close: git.close,
  };
}

/**
 * What every agent's bridge serves until the CLI has settings for it
 * (HAL-6477): the program's own sign-in for both providers, which Halonic
 * never reads and spends nothing on; no Halonic tools; and approvals that
 * refuse every request, so a call that needs a person fails with its own
 * error. No key passes through here.
 */
const bridgeServices: BridgeServices = {
  providers: { anthropic: { kind: "sign-in" }, openai: { kind: "sign-in" } },
  prices: {},
  tools: {
    list: async () => [],
    check: async (name) => ({ kind: "refused", reason: `${name} isn't a tool of this agent.` }),
    call: async (name) => ({ result: `${name} isn't a tool of this agent.`, outcome: "error" }),
  },
  approvals: refusingApprovals,
};

/**
 * What the bridge reads provider keys from: nothing. Every agent signs in
 * with its own program (`bridgeServices`), so no key is needed, and a key
 * the CLI remembers never reaches the bridge. A host that serves a provider
 * key must pass the secrets it reads it from, and the HAL-6477 sign-in
 * decision comes first.
 */
const noSecrets: Secrets = { get: async () => null };

/** Claude Code and Codex, found where the launcher would start them. */
function nodeHarnesses(): NonNullable<LocalHarnessParts["harnesses"]> {
  const probe = createProgramProbe();
  return {
    "claude-code": claudeCodeHarness({ probe }),
    codex: codexHarness({ probe, halonicVersion }),
  };
}

/**
 * How a harness starts here, which the profile builder reads only on
 * Windows. Finding where Windows installed it isn't built yet, so a
 * harness run there stops with that reason instead of running with a
 * guess.
 */
async function installOf(harness: string, platform: NodeJS.Platform): Promise<HarnessInstall> {
  if (platform === "win32") {
    throw new Error(
      `Halonic can't find where ${harness} is installed on Windows yet, so the CLI can't run it in the sandbox.`,
    );
  }
  return { program: harness, packageFolder: null };
}

/** The variables a harness program gets from the CLI's own: where to find programs, and the locale, never a key. */
function programEnvironment(
  variables: Readonly<Record<string, string | undefined>>,
): Record<string, string> {
  const names = ["PATH", "LANG", "LC_ALL", "LC_CTYPE", "TZ", "SystemRoot", "PATHEXT", "ComSpec"];
  const given: Record<string, string> = {};
  for (const name of names) {
    const value = variables[name];
    if (value !== undefined && value !== "") given[name] = value;
  }
  return given;
}

/**
 * The bridge server, serving each run's bridge on a Unix socket in the
 * profile where the platform lets a sandboxed program reach one, as the
 * agent host does, else on a loopback port.
 */
async function nodeBridgeServer(input: LocalHarnessInput): Promise<HarnessBridgeServer> {
  const platform = input.parts?.platform ?? process.platform;
  const sockets = platform === "linux" || platform === "darwin";
  const socketFolder = join(input.profile.root, bridgeSocketsFolder);
  if (sockets) await makePrivateFolder(socketFolder);
  return new NodeHarnessBridgeServer({
    secrets: noSecrets,
    ...(sockets ? { socketFolder } : {}),
  });
}

/**
 * The agents' files, found by hub and id in the loaded workspace: as the
 * run's version has them when runs start from versions, else as they are on
 * disk now.
 */
function agentFilesOf(input: LocalHarnessInput): AgentFiles {
  return {
    bytesOf: async (hubId, agentId, run) => {
      if (input.versions !== undefined) {
        return await input.versions.agentFileOf(run, hubId, agentId);
      }
      const file = filesOf(input.workspace(), "agent").find(
        (each) => each.hub === hubId && each.value.id === agentId,
      );
      if (file === undefined) {
        throw new Error(`Hub "${hubId}" has no agent "${agentId}".`);
      }
      return new Uint8Array(await readFile(join(input.location, file.path)));
    },
  };
}

/** Whether every folder is missing or has nothing in it. */
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

/** Makes the folder private, then removes everything in it. */
async function emptyFolder(folder: string): Promise<void> {
  await makePrivateFolder(folder);
  for (const entry of await readdir(folder)) {
    await rm(join(folder, entry), { recursive: true, force: true });
  }
}
