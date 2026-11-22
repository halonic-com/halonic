// The computer `halonic doctor` asks: this one, with its trust records,
// sandbox, disk, harness programs and model servers. The doctor service on
// such a machine lives in `@halonicjs/adapter-doctor-node`, which the agent
// host uses too (HAL-13407); the command builds it here, with the CLI's own
// version, and tests hand it fakes.

import { arch, platform } from "node:os";
import {
  findCommand,
  type MachineWorkspace,
  doctorService as machineDoctorService,
  trustedOnMachine as machineTrustedOnMachine,
  type DoctorMachine as NodeDoctorMachine,
  networkProblemOf,
  nodeCommandSearch,
  type SandboxKind,
  sandboxKindOf,
} from "@halonicjs/adapter-doctor-node";
import { FileAgentPlacementStore, FileTrustStore } from "@halonicjs/adapter-fs-node";
import { SrtSandbox } from "@halonicjs/adapter-sandbox-srt";
import { NodeResourceProbe } from "@halonicjs/adapter-system-node";
import {
  AgentPlacement,
  type DoctorService,
  type DoctorWorkspace,
  type ProfileProblem,
} from "@halonicjs/app";
import type { Secrets } from "@halonicjs/ports";
import { placementFolder, profileFolder, trustFolder } from "@halonicjs/profile";
import { systemClock } from "@halonicjs/std";
import { type AddedPlugins, addedPluginsOf } from "./connector-plugin.ts";
import { engineHttp } from "./engine-http.ts";
import { nodeHarnessPrograms } from "./harness-programs.ts";
import { openPluginService } from "./plugin-host.ts";
import { proxySetting } from "./proxy-setting.ts";
import { privateJournalFolder } from "./sandbox-journals.ts";
import { profileKeyOrigins } from "./secret-host.ts";
import { halonicVersion } from "./version.ts";
import { nodeProfileEnvironment, webCryptoDigest } from "./workspace-runs.ts";
import { nodeIsWsl, nodeProblemOf, windowsDriveOf } from "./wsl.ts";

export {
  type MachineWorkspace,
  withHarnessSettingsFolders,
} from "@halonicjs/adapter-doctor-node";

/**
 * What `halonic doctor` asks on this computer: what the package's doctor
 * asks, and the plugins the CLI's Plugins line reads.
 */
export interface DoctorMachine extends NodeDoctorMachine {
  /** The plugins added in the profile, for the Plugins line (HAL-14296); left out, no line. */
  readonly plugins?: AddedPlugins;
}

/** The names Node gives the systems, as a person reads them. */
const systemNames: Readonly<Record<string, string>> = {
  linux: "Linux",
  darwin: "macOS",
  win32: "Windows",
};

/**
 * The kinds of sandbox as the ready Sandbox line names them. srt's Windows
 * mode has the name Settings › Agent sandbox gives it, so a person meets
 * one name (HAL-16290).
 */
const sandboxKindNames: Readonly<Record<SandboxKind, string>> = {
  bubblewrap: "bubblewrap",
  seatbelt: "Seatbelt",
  windows: "Sandbox for Windows",
};

/**
 * The kind of sandbox the ready Sandbox line names on `system`.
 *
 * @param system - the system as Node names it, such as `process.platform`
 * @returns the kind's name, such as "Seatbelt", or `system` itself on a system srt doesn't run on
 * @example
 * sandboxKindName("win32"); // "Sandbox for Windows"
 */
export function sandboxKindName(system: string): string {
  const kind = sandboxKindOf(system);
  return kind === undefined ? system : sandboxKindNames[kind];
}

/**
 * This computer: the profile from `HALONIC_HOME` or the system's data
 * folder, the srt sandbox, Node's resource probe, Claude Code and Codex as
 * `PATH` finds them, `fetch`, under WSL the Windows drives, what is wrong
 * with the Node.js that runs it, and with the proxy setting it started with.
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
    sandboxKind: sandboxKindName(system),
    probe: new NodeResourceProbe(),
    harnesses: nodeHarnessPrograms(),
    http: engineHttp(),
    system: `${systemNames[system] ?? system} ${arch()}`,
    ...(nodeIsWsl() ? { windowsDrive: windowsDriveOf } : {}),
    node: () =>
      nodeProblemOf({
        platform: process.platform,
        cwd: process.cwd(),
        wsl: nodeIsWsl,
        findPnpm: () => findCommand("pnpm", nodeCommandSearch()),
      }),
    network: () => networkProblemOf(proxySetting),
    wslDistro: process.env["WSL_DISTRO_NAME"],
    signInShell: system === "win32" ? "powershell" : "sh",
    placement: new AgentPlacement({
      store: new FileAgentPlacementStore(placementFolder(profile)),
      digest: webCryptoDigest,
      clock: systemClock,
    }),
    keyOrigins: profileKeyOrigins(),
    // Opened only when a connector uses a plugin, as `tools review` opens it.
    plugins: () => addedPluginsOf(openPluginService({}))(),
  };
}

/**
 * The `DoctorService` over `machine`, as the package builds it, with the
 * CLI's version on any trust record the check updates. `profile` is how
 * the workspace and the profile folder overlap, for the Profile line.
 */
export async function doctorService(
  machine: DoctorMachine,
  secrets: Secrets,
  workspace: MachineWorkspace | null,
  profile: ProfileProblem | null = null,
): Promise<DoctorService> {
  return await machineDoctorService(machine, secrets, workspace, {
    appVersion: halonicVersion,
    profile,
  });
}

/**
 * Whether `run` would find the workspace trusted on this computer, from the
 * same trust records `doctor`'s Workspace line reads.
 */
export async function trustedOnMachine(
  machine: Pick<DoctorMachine, "trustStore">,
  workspace: DoctorWorkspace,
): Promise<boolean> {
  return await machineTrustedOnMachine(machine, workspace, { appVersion: halonicVersion });
}
