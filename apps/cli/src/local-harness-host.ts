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
  FileInstructionTrustStore,
  makePrivateFolder,
} from "@halonicjs/adapter-fs-node";
import { type GitRunnerOptions, lazyGitVcs } from "@halonicjs/adapter-git";
import { NodeHarnessBridgeServer, providerHostClass } from "@halonicjs/adapter-harness-bridge";
import { claudeCodeHarness } from "@halonicjs/adapter-harness-claude-code";
import { codexHarness } from "@halonicjs/adapter-harness-codex";
import {
  type HarnessInstall,
  HarnessProfiles,
  programEnvironment,
  RunInstructions,
  WorkspaceHarnessHost,
} from "@halonicjs/adapter-harness-kit";
import { createNodeHttpClient } from "@halonicjs/adapter-http-node";
import { createHostSandbox, createProgramProbe } from "@halonicjs/adapter-sandbox-host";
import { InstructionTrustService } from "@halonicjs/app";
import type { HarnessAgent, HarnessRunsOptions } from "@halonicjs/engine";
import {
  type AgentFiles,
  type BridgeAgent,
  type BridgeServers,
  type HarnessHost,
  harnessHostOf,
  type ProviderAccessChoice,
} from "@halonicjs/host-harness-host";
import type {
  Clock,
  DefinitionStore,
  Digest,
  HarnessBridgeServer,
  HttpClient,
  KeyOrigins,
  Secrets,
} from "@halonicjs/ports";
import {
  type ProfileEnvironment,
  type ProfileFolder,
  placementFolder,
  type WorkspaceFolders,
} from "@halonicjs/profile";
import { filesOf, type LoadedWorkspace } from "@halonicjs/workspace";
import { sweepingUnderHostLock, withoutHostLock } from "./fenced-sandbox.ts";
import { HarnessProviderKeys } from "./harness-provider-keys.ts";
import { localProposalParts } from "./local-proposals.ts";
import { proxySetting } from "./proxy-setting.ts";
import { skillFileOf } from "./skill-file.ts";
import { halonicVersion } from "./version.ts";
import type { WorkspaceVersions } from "./workspace-versions.ts";

/**
 * How long one harness call may last before the sandbox stops its program,
 * in milliseconds: half an hour, as long as a coding agent's task may take
 * and short enough that a stuck program doesn't hold a terminal for a day.
 */
export const harnessCallLimitMs = 30 * 60_000;

/**
 * The folder of the trusted instructions, `instruction-trust` in the profile
 * folder, never inside a workspace and never reachable by a tool the model
 * can call (fs-node's `FileInstructionTrustStore`).
 */
export function instructionTrustFolder(profile: ProfileFolder): string {
  return join(profile.root, "instruction-trust");
}

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
  /** Opens every run's bridge, whatever its placement; Node's, on the keys of `HarnessProviderKeys`, by default. */
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
  readonly versions?: Pick<WorkspaceVersions, "agentFileOf" | "skillTextOf">;
  /** The workspace's files, which Accept writes and a proposal's base is read from. */
  readonly store: DefinitionStore;
  readonly digest: Digest;
  readonly clock: Clock;
  /** Which git makes the worktrees; the one on the `PATH` by default. */
  readonly git?: GitRunnerOptions;
  /** The runs the engine hasn't ended, whose folders stay at `start`; read only when a folder is left from before. */
  openRuns(): Promise<ReadonlySet<string>>;
  /** Hears the error of a folder's end that couldn't finish, and of a temp folder that couldn't be removed. */
  reportError(error: unknown): void;
  /** Hears of a harness bridge failure the run log couldn't record (requirement `harness-host.bridge-failures`). */
  reportBridgeError(error: unknown): void;
  /** The CLI's remembered secrets, which a sandboxed agent's provider key is read from. */
  readonly secrets: Secrets;
  /** The addresses each saved key may be sent to. */
  readonly keyOrigins: KeyOrigins;
  /** Whether the command's trust check granted trust, so a key may go to a provider's own `baseUrl`. */
  readonly trusted: boolean;
  /** What the bridge calls a provider at its own `baseUrl` with, as the engine's model calls do. */
  readonly http: HttpClient;
  /** Hears the access each harness agent's bridge got: the provider and the secret's name, never a value. */
  reportAccess?(agent: BridgeAgent, choice: ProviderAccessChoice): void;
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
  /** Stops git, if it started, and gives the profile's host lock up, if it took it. Close it once the executor and the scheduler have closed. Safe to call twice. */
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
  // Sweeps kept Windows grants only under the profile's host lock (HAL-6780); a test's own sandbox takes no lock.
  const fenced =
    parts.fenced === undefined
      ? sweepingUnderHostLock({
          platform,
          profile,
          sweepRoots: [tempRoot, folders.proposalWorktreesFolder(), folders.runCopiesFolder()],
          warn: (message) => input.reportError(new Error(message.trim())),
        })
      : withoutHostLock(parts.fenced);
  const git = lazyGitVcs({
    location: input.location,
    worktrees: folders.proposalWorktreesFolder(),
    ...(input.git === undefined ? {} : { git: input.git }),
  });
  const keys = new HarnessProviderKeys({
    workspace: input.workspace,
    secrets: input.secrets,
    keyOrigins: input.keyOrigins,
    trusted: input.trusted,
    ...(input.reportAccess === undefined ? {} : { reportAccess: input.reportAccess }),
  });
  const built = harnessHostOf({
    sandboxes: {
      sandbox: host.removingTempFolders(fenced),
      "this-computer": host.removingTempFolders(parts.launcher ?? createHostSandbox()),
    },
    harnesses,
    bridgeServers: await bridgeServersOf(input, keys.bridgeSecrets),
    services: keys,
    scrub: keys.scrub,
    reportError: input.reportBridgeError,
    profiles,
    home: input.environment.homeFolder,
    instructions: new RunInstructions({
      // Inside the temp root, so what an engine that stopped left is cleared when the next one opens.
      root: join(tempRoot, "instructions"),
      skillTextOf: skillTextOf(input),
    }),
    // A run whose instructions changed since a person trusted them is refused before it starts.
    instructionTrust: {
      service: new InstructionTrustService({
        store: new FileInstructionTrustStore(instructionTrustFolder(profile)),
        clock: input.clock,
      }),
      location: input.location,
    },
    placement: {
      store: new FileAgentPlacementStore(placementFolder(profile)),
      location: input.location,
      files: agentFilesOf(input),
    },
    digest: input.digest,
    clock: input.clock,
    // The same parts `halonic proposals` reviews the proposals with.
    proposals: localProposalParts({
      folders,
      store: input.store,
      digest: input.digest,
      vcs: git.vcs,
      reportError: input.reportError,
    }),
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
    close: async () => {
      await git.close();
      // After the executor has closed, so no session of this engine is still open.
      await fenced.release().catch(input.reportError);
    },
  };
}

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

/** The test's one bridge server for both placements, else {@link nodeBridgeServers}. */
async function bridgeServersOf(input: LocalHarnessInput, secrets: Secrets): Promise<BridgeServers> {
  const given = input.parts?.bridgeServer;
  if (given !== undefined) return { sandbox: given, "this-computer": given };
  return await nodeBridgeServers(input, secrets);
}

/**
 * The bridge servers by placement (HAL-13090). A fenced run's bridge serves
 * a Unix socket in the profile where the platform lets a sandboxed program
 * reach one through its sandbox's proxy, as the agent host does (W9,
 * HAL-6316), else a loopback port. A run on this computer has no sandbox and
 * so no proxy, and the launcher refuses a socket bridge: its bridge always
 * serves a loopback port, still guarded by the run's own token. That program
 * already runs with the person's full rights, so loopback opens nothing it
 * couldn't reach anyway.
 *
 * Both reach Anthropic's and OpenAI's own hosts only, and a provider's own
 * `baseUrl` through the engine's `http`, whose address checks are a
 * connector's.
 *
 * @param secrets - the only secrets they may read: the keys the provider files name
 */
async function nodeBridgeServers(
  input: LocalHarnessInput,
  secrets: Secrets,
): Promise<BridgeServers> {
  const platform = input.parts?.platform ?? process.platform;
  const sockets = platform === "linux" || platform === "darwin";
  const socketFolder = join(input.profile.root, bridgeSocketsFolder);
  if (sockets) await makePrivateFolder(socketFolder);
  const providers = createNodeHttpClient({ hostClass: providerHostClass, proxy: proxySetting });
  const serverOn = (where: { socketFolder?: string }) =>
    new NodeHarnessBridgeServer({
      secrets,
      fetch: (url, init) => providers.fetch(url, init),
      compatibleFetch: (url, init) => input.http.fetch(url, init),
      ...where,
    });
  return {
    sandbox: serverOn(sockets ? { socketFolder } : {}),
    "this-computer": serverOn({}),
  };
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

/**
 * A skill's `SKILL.md` as the run's version has it when runs start from
 * versions, else as it is on disk now, so the agent's file and its skills in
 * one pin are from one version.
 */
function skillTextOf(
  input: LocalHarnessInput,
): (agent: HarnessAgent, id: string) => Promise<string> {
  return async (agent, id) => {
    if (input.versions !== undefined) {
      return await input.versions.skillTextOf(agent, agent.hubId, id);
    }
    const file = skillFileOf(input.workspace(), agent.hubId, id);
    if (file === undefined) throw new Error(`The workspace has no skill "${id}".`);
    return await readFile(join(input.location, file.path), "utf8");
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
