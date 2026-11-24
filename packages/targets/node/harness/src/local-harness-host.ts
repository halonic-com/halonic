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

import { readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import {
  FileAgentPlacementStore,
  FileInstructionTrustStore,
  makePrivateFolder,
} from "@halonicjs/adapter-fs-node";
import { lazyGitVcs } from "@halonicjs/adapter-git";
import { claudeCodeHarness } from "@halonicjs/adapter-harness-claude-code";
import { codexHarness } from "@halonicjs/adapter-harness-codex";
import {
  type HarnessInstall,
  HarnessProfiles,
  programEnvironment,
  RunInstructions,
  resolveRealPath,
  WorkspaceHarnessHost,
} from "@halonicjs/adapter-harness-kit";
import { createHostSandbox, createProgramProbe } from "@halonicjs/adapter-sandbox-host";
import { InstructionTrustService } from "@halonicjs/app";
import { type BridgeServers, harnessHostOf } from "@halonicjs/host-harness-host";
import type { Secrets } from "@halonicjs/ports";
import { type ProfileFolder, placementFolder } from "@halonicjs/profile";
import { cliProviderKeys } from "./cli-provider-keys.ts";
import { sweepingUnderHostLock, withoutHostLock } from "./fenced-sandbox.ts";
import { localBridgeServers } from "./local-bridge-servers.ts";
import type {
  LocalHarnessHost,
  LocalHarnessInput,
  LocalHarnessParts,
} from "./local-harness-types.ts";
import { localProposalParts } from "./local-proposals.ts";
import { agentFilesOf, skillTextOf } from "./local-run-files.ts";

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

  const harnesses = parts.harnesses ?? nodeHarnesses(input.halonicVersion);
  const host = new WorkspaceHarnessHost({
    settingsFolders: folders,
    tempRoot,
    harnesses,
    installOf: (harness) => installOf(harness, platform),
    onLeftoverTempFolder: (_folder, error) => input.reportError(error),
  });
  const fenced = fencedSandboxOf(input, platform, tempRoot);
  const git = lazyGitVcs({
    location: input.location,
    worktrees: folders.proposalWorktreesFolder(),
    ...(input.git === undefined ? {} : { git: input.git }),
  });
  const keys = cliProviderKeys({
    workspace: input.workspace,
    secrets: input.secrets,
    trusted: input.trusted,
    keyOrigins: input.keyOrigins,
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
    models: keys.models,
    scrub: keys.scrub,
    reportError: input.reportBridgeError,
    profiles: new HarnessProfiles({
      workspace: input.location,
      // The whole profile folder: the run's own folders in it are the only ones reopened.
      halonicData: profile.root,
      home: input.environment.homeFolder,
      host,
      env: parts.programEnvironment ?? programEnvironment(process.env),
      timeLimitMs: harnessCallLimitMs,
      platform,
      ...(input.codingTools === undefined ? {} : { codingTools: input.codingTools }),
    }),
    // An agent with `asks: in-sandbox` runs its calls in its working folder without asking, fenced (HAL-14992).
    paths: { resolve: resolveRealPath, windows: platform === "win32" },
    home: input.environment.homeFolder,
    ...instructionPartsOf(input, tempRoot),
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

/**
 * The fenced sandbox: the test's own, or the srt one that sweeps kept
 * Windows grants only under the profile's host lock (HAL-6780).
 */
function fencedSandboxOf(input: LocalHarnessInput, platform: NodeJS.Platform, tempRoot: string) {
  const { folders, profile } = input;
  const own = input.parts?.fenced;
  if (own !== undefined) return withoutHostLock(own);
  return sweepingUnderHostLock({
    platform,
    profile,
    sweepRoots: [tempRoot, folders.proposalWorktreesFolder(), folders.runCopiesFolder()],
    warn: (message) => input.reportHostLock(new Error(message.trim())),
  });
}

/** What pins a run's instructions: their text, the trust in them, and where each agent runs. */
function instructionPartsOf(input: LocalHarnessInput, tempRoot: string) {
  return {
    instructions: new RunInstructions({
      // Inside the temp root, so what an engine that stopped left is cleared when the next one opens.
      root: join(tempRoot, "instructions"),
      skillTextOf: skillTextOf(input),
    }),
    // A run whose instructions changed since a person trusted them is refused before it starts.
    instructionTrust: {
      service: new InstructionTrustService({
        store: new FileInstructionTrustStore(instructionTrustFolder(input.profile)),
        clock: input.clock,
      }),
      location: input.location,
    },
    placement: {
      store: new FileAgentPlacementStore(placementFolder(input.profile)),
      location: input.location,
      files: agentFilesOf(input),
    },
  };
}

/** Claude Code and Codex, found where the launcher would start them. */
function nodeHarnesses(halonicVersion: string): NonNullable<LocalHarnessParts["harnesses"]> {
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

/**
 * The test's one bridge server for both placements, else the Node bridge
 * servers, which never call one of Halonic's own ports (HAL-15251).
 */
async function bridgeServersOf(input: LocalHarnessInput, secrets: Secrets): Promise<BridgeServers> {
  const parts = input.parts ?? {};
  if (parts.bridgeServer !== undefined) {
    return { sandbox: parts.bridgeServer, "this-computer": parts.bridgeServer };
  }
  const compatibleHttp = parts.compatibleHttp;
  return await localBridgeServers({
    secrets,
    platform: parts.platform ?? process.platform,
    profile: input.profile,
    ...(input.ownPorts === undefined ? {} : { ownPorts: input.ownPorts }),
    ...(compatibleHttp === undefined ? {} : { compatibleHttp: () => compatibleHttp }),
  });
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
