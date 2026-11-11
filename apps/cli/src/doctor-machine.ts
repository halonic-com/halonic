// The parts of this computer `halonic doctor` asks: the trust records, the
// sandbox, the disk, the harness programs and the model servers. The
// command builds its `DoctorService` from them; tests hand it fakes.

import { readdir } from "node:fs/promises";
import { arch, platform } from "node:os";
import { join } from "node:path";
import { FileTrustStore } from "@halonicjs/adapter-fs-node";
import { SrtSandbox } from "@halonicjs/adapter-sandbox-srt";
import { NodeResourceProbe } from "@halonicjs/adapter-system-node";
import {
  type DataFolder,
  DoctorService,
  type DoctorServiceOptions,
  type DoctorWorkspace,
  type LoadedModelSource,
  ResourceReport,
  type TrustService,
} from "@halonicjs/app";
import type { Provider } from "@halonicjs/format";
import type {
  HttpClient,
  ResourceProbe,
  RunStore,
  Sandbox,
  Secrets,
  TrustStore,
} from "@halonicjs/ports";
import { type ProfileFolder, profileFolder, trustFolder } from "@halonicjs/profile";
import { systemClock } from "@halonicjs/std";
import { nodeHarnessPrograms } from "./harness-programs.ts";
import {
  isOnThisComputer,
  type LocalModelServer,
  localLoadedModels,
} from "./local-model-servers.ts";
import { privateJournalFolder } from "./sandbox-journals.ts";
import { nodeProfileEnvironment } from "./workspace-runs.ts";
import { cliTrustService } from "./workspace-trust.ts";

/** What `doctor` asks on this computer. */
export interface DoctorMachine {
  /** The profile folder: the trust records and the runs are in it. */
  readonly profile: ProfileFolder;
  readonly trustStore: TrustStore;
  readonly sandbox: Pick<Sandbox, "check" | "capabilities">;
  /** The kind of sandbox on the ✓ line, such as "bubblewrap". */
  readonly sandboxKind: string;
  readonly probe: ResourceProbe;
  readonly harnesses: DoctorServiceOptions["harnesses"];
  /** Reaches the model servers on this computer. */
  readonly http: HttpClient;
  /** The operating system and processor, such as "Linux x64". */
  readonly system: string;
}

/** The workspace for {@link doctorService}, with the provider files its servers are read from. */
export interface MachineWorkspace {
  readonly workspace: DoctorWorkspace;
  /** The workspace's provider files, by id. */
  readonly providerFiles: ReadonlyMap<string, Provider>;
}

/** The names Node gives the systems, as a person reads them. */
const systemNames: Readonly<Record<string, string>> = {
  linux: "Linux",
  darwin: "macOS",
  win32: "Windows",
};

/** The sandbox each system has: bubblewrap on Linux, Seatbelt on macOS (see `SrtSandbox`). */
const sandboxKinds: Readonly<Record<string, string>> = {
  linux: "bubblewrap",
  darwin: "Seatbelt",
};

/** The folders in a workspace's profile folder that hold what its runs left. */
const runFolderNames = ["runs", "deployments", "blobs"];

/**
 * This computer: the profile from `HALONIC_HOME` or the system's data
 * folder, the srt sandbox, Node's resource probe, Claude Code and Codex as
 * `PATH` finds them, and `fetch`.
 *
 * @throws RangeError when `HALONIC_HOME` or the home folder isn't absolute
 */
export function nodeDoctorMachine(): DoctorMachine {
  const profile = profileFolder(nodeProfileEnvironment());
  const system = platform();
  return {
    profile,
    trustStore: new FileTrustStore(trustFolder(profile)),
    sandbox: new SrtSandbox(undefined, undefined, privateJournalFolder(profile)),
    sandboxKind: sandboxKinds[system] ?? system,
    probe: new NodeResourceProbe(),
    harnesses: nodeHarnessPrograms(),
    http: { fetch: (url, init) => fetch(url, init) },
    system: `${systemNames[system] ?? system} ${arch()}`,
  };
}

/**
 * The `DoctorService` over `machine`, with a source of loaded models for
 * each server on this computer the workspace uses, and the run data of
 * every workspace in the profile as the Disk line's use.
 *
 * It reads no run logs: `doctor` shows no waits in 0.1 (P6 on HAL-2264).
 */
export async function doctorService(
  machine: DoctorMachine,
  secrets: Secrets,
  workspace: MachineWorkspace | null,
): Promise<DoctorService> {
  const trust = cliTrustService(machine.trustStore, systemClock);
  const trusted = await isTrusted(trust, workspace);
  const resources = new ResourceReport({
    probe: machine.probe,
    runs: noRuns,
    clock: systemClock,
    dataRoot: machine.profile.root,
    dataFolders: await runDataFolders(machine.profile),
    modelSources: modelServers(workspace).map((server) =>
      modelSourceOf(server, machine.http, trusted),
    ),
  });
  return new DoctorService({
    trust,
    sandbox: machine.sandbox,
    resources,
    harnesses: machine.harnesses,
    secrets,
  });
}

/** Whether the workspace is trusted on this computer as it is now; `false` outside one. */
async function isTrusted(trust: TrustService, workspace: MachineWorkspace | null) {
  if (workspace === null) return false;
  return (await trust.check(workspace.workspace.trust)).status === "trusted";
}

/**
 * Where `doctor` reads a server's loaded models. A workspace names its
 * servers' addresses itself, so before it is trusted here `doctor` only
 * asks a server on this computer, and sends nothing to any other address:
 * that server shows as not answering.
 */
function modelSourceOf(
  server: LocalModelServer,
  http: HttpClient,
  trusted: boolean,
): LoadedModelSource {
  if (trusted || isOnThisComputer(server.baseUrl)) return localLoadedModels(server, http);
  return {
    id: server.id,
    loadedModels: () =>
      Promise.reject(
        new Error(`${server.id} isn't on this computer, and the workspace isn't trusted here.`),
      ),
  };
}

/** Each server on this computer the workspace's aliases use, at its `baseUrl` or its default address. */
function modelServers(workspace: MachineWorkspace | null) {
  if (workspace === null) return [];
  return workspace.workspace.providers.flatMap((provider) => {
    const file = workspace.providerFiles.get(provider.provider);
    if (provider.runs !== "on-this-computer" || file === undefined) return [];
    const baseUrl = file.baseUrl ?? `http://${provider.address}/v1`;
    return [{ id: provider.provider, type: file.type, baseUrl }];
  });
}

/**
 * The runs, deployment runs and blobs of every workspace in the profile, as
 * run logs. The records and the trust records aren't counted yet: the
 * resource report has no kind for them, and they stay small in 0.1.
 */
async function runDataFolders(profile: ProfileFolder): Promise<DataFolder[]> {
  const workspaces = join(profile.root, "workspaces");
  const keys = await folderNames(workspaces);
  return keys.flatMap((key) =>
    runFolderNames.map((name) => ({
      kind: "run-logs" as const,
      workspace: key,
      path: join(workspaces, key, name),
    })),
  );
}

/** The folders in `folder`, or none when it doesn't exist yet. */
async function folderNames(folder: string): Promise<string[]> {
  try {
    const entries = await readdir(folder, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

/** A run store with no runs, for a report that shows no waits. */
const noRuns: Pick<RunStore, "list" | "events"> = {
  list: async () => [],
  events: async () => [],
};
