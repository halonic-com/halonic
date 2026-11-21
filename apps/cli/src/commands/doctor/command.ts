import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { nodeCommandSearch, readDoctorWorkspace, usedConnectors } from "@halonicjs/adapter-doctor-node";
import type { DoctorReport, DoctorWorkspace, ProfileProblem } from "@halonicjs/app";
import { type Secrets, workspaceSecrets } from "@halonicjs/ports";
import type { LoadedWorkspace } from "@halonicjs/workspace";
import { cliProviderKeys } from "../../cli-provider-keys.ts";
import type { CliCommand, CommandInput } from "../../command.ts";
import {
  type DoctorMachine,
  doctorService,
  type MachineWorkspace,
  nodeDoctorMachine,
  trustedOnMachine,
  withHarnessSettingsFolders,
} from "../../doctor-machine.ts";
import { withPluginProblems } from "../../doctor-plugins.ts";
import { agentsWithProviderKey, withHarnessProviderKeys } from "../../doctor-provider-keys.ts";
import { exitCode } from "../../exit-code.ts";
import { doctorMessages } from "../../messages/doctor.ts";
import { doctorReportLines } from "../../output/doctor-report.ts";
import { profileProblem } from "../../profile-place.ts";
import { studioWatchedFileLimit } from "../../studio-watch-limit.ts";
import { halonicVersion } from "../../version.ts";
import {
  dirOption,
  holdsWorkspaceFile,
  NoWorkspaceError,
  type WorkspaceDir,
  workspaceDir,
} from "../../workspace-dir.ts";

/** What tests change about `halonic doctor`, besides the computer. */
export interface DoctorCommandOptions {
  /** The most files Studio watches; {@link studioWatchedFileLimit} by default. */
  readonly watchedFileLimit?: number;
}

/**
 * `halonic doctor [--dir <folder>]` on the computer `machine` reads, so tests
 * can hand it a fake one.
 */
export function createDoctorCommand(
  machine: () => DoctorMachine,
  { watchedFileLimit = studioWatchedFileLimit }: DoctorCommandOptions = {},
): CliCommand {
  return {
    name: "doctor",
    usage: "[--dir <folder>]",
    summary: doctorMessages.summary(),
    action: (input) => doctorMessages.action(givenDir(input)),
    options: { dir: dirOption },
    async run(input, context) {
      const given = givenDir(input);
      const computer = machine();
      const secrets = workspaceSecrets(context.secrets);
      const dir = workspaceDir(input, context.cwd);
      const { profile, workspace } = await workspaceToCheck(dir, given !== undefined, {
        watchedFileLimit,
        computer,
        secrets,
      });
      // The store as a run reads it, so `doctor` can't call set a name a run refuses.
      const doctor = await doctorService(computer, secrets, workspace, profile);
      const report = await doctor.check(workspace?.workspace ?? null);
      const lines = doctorReportLines(report, {
        version: halonicVersion,
        system: computer.system,
        sandboxKind: computer.sandboxKind,
        ...(computer.wslDistro === undefined ? {} : { wslDistro: computer.wslDistro }),
        signInShell: computer.signInShell,
        ...(given === undefined ? {} : { dir: given }),
      });
      return {
        // 1 only for a ✕ line; a ! line prints but exits 0 (cli-output 3.7).
        exitCode: report.summary.needsFixing ? exitCode.failed : exitCode.ok,
        lines,
        json: doctorJson(report),
      };
    },
  };
}

/**
 * `halonic doctor`: checks that this computer can run Halonic, and the
 * workspace in the folder when there is one (cli-output 3.7).
 */
export const doctorCommand: CliCommand = createDoctorCommand(nodeDoctorMachine);

/** The `--dir` as the user typed it, or nothing without one. */
function givenDir(input: CommandInput): string | undefined {
  const dir = input.options["dir"];
  return typeof dir === "string" ? dir : undefined;
}

/**
 * The Profile line's problem with `dir` and the workspace `doctor` checks
 * there, `null` when there's none or it overlaps the profile.
 *
 * @throws NoWorkspaceError when `--dir` was given and has no `workspace.yaml`
 */
async function workspaceToCheck(
  dir: WorkspaceDir,
  dirGiven: boolean,
  { watchedFileLimit, computer, secrets }: WorkspaceReadOptions,
): Promise<{ profile: ProfileProblem | null; workspace: MachineWorkspace | null }> {
  // Every other command refuses a workspace that overlaps the profile;
  // `doctor` shows it on the Profile line and leaves the workspace unread,
  // since its files are fenced off from the profile (HAL-15201). A folder
  // without `workspace.yaml` is no workspace, so there's nothing to overlap;
  // the plain look decides that, since the fenced store refuses to answer
  // for a folder inside the profile (HAL-15827).
  if (!(await holdsWorkspaceFile(dir.root))) {
    if (dirGiven) throw new NoWorkspaceError();
    return { profile: null, workspace: null };
  }
  const profile = await profileProblem(dir.root);
  if (profile !== null) return { profile, workspace: null };
  const read = await readWorkspace(dir, dirGiven, watchedFileLimit, computer, secrets);
  const workspace =
    read === null
      ? null
      : await withHarnessSettingsFolders(withWindowsDrive(read, computer), computer.profile);
  return { profile: null, workspace };
}

/** What {@link workspaceToCheck} reads the workspace with. */
interface WorkspaceReadOptions {
  readonly watchedFileLimit: number;
  readonly computer: DoctorMachine;
  readonly secrets: Secrets;
}

/**
 * The workspace in `dir`, or `null` when there's none: then `doctor` checks
 * only the computer. A `--dir` that holds no workspace is a mistake, though.
 * It counts the workspace's files up to `watchedFileLimit`, so the Workspace
 * line can say when Studio won't watch the folder (HAL-12295). With the
 * person's placement choices, it finds the harness agents whose runs get a
 * provider key, so the Harnesses line doesn't ask about their own sign-in
 * (HAL-14661) and the Secrets line checks that key (HAL-15086). It checks
 * the plugins its agents' connectors use against the profile's (HAL-14296).
 *
 * @throws NoWorkspaceError when `--dir` was given and has no `workspace.yaml`
 */
async function readWorkspace(
  dir: WorkspaceDir,
  dirGiven: boolean,
  watchedFileLimit: number,
  computer: DoctorMachine,
  secrets: Secrets,
): Promise<MachineWorkspace | null> {
  const read = await readDoctorWorkspace(dir, {
    watchedFileLimit,
    commandSearch: nodeCommandSearch(),
    fence: computer.profile.root,
  });
  if (read === null) {
    if (dirGiven) throw new NoWorkspaceError();
    return null;
  }
  const { workspace, providerFiles, loaded, location } = read;
  return {
    workspace: await withPluginProblems(
      await withProviderKeyAgents(computer, secrets, loaded, workspace, location),
      usedConnectors(loaded),
      computer.plugins,
    ),
    providerFiles,
  };
}

/**
 * `found`, with the harness agents whose runs get a provider key and the
 * keys they get among the secrets to check, decided with the CLI's
 * own key services as `run` builds them, with the person's placement choices,
 * the workspace's trust and the keys' allowed addresses. Without the choices
 * or the addresses, `found` as it is, so the Harnesses line asks about every agent.
 */
async function withProviderKeyAgents(
  computer: DoctorMachine,
  secrets: Secrets,
  loaded: LoadedWorkspace,
  found: DoctorWorkspace,
  location: string,
): Promise<DoctorWorkspace> {
  const { placement, keyOrigins } = computer;
  if (placement === undefined || keyOrigins === undefined) return found;
  const keys = cliProviderKeys({
    workspace: () => loaded,
    secrets,
    trusted: await trustedOnMachine(computer, found),
    keyOrigins,
  });
  const keyed = await agentsWithProviderKey({
    workspace: loaded,
    placement,
    location,
    readFile: async (path) => new Uint8Array(await readFile(join(location, path))),
    access: (agent) => keys.accessFor(agent),
  });
  return {
    ...withHarnessProviderKeys(found, keyed.keys),
    agentsWithProviderKey: keyed.agents,
    ...(keyed.refused.length === 0 ? {} : { refusedHarnessModels: keyed.refused }),
  };
}

/**
 * `workspace`, with the Windows drive it is on when `computer` runs under
 * WSL and finds one (HAL-6517): its real path, the trust record's key, says.
 */
function withWindowsDrive(
  workspace: MachineWorkspace,
  computer: Pick<DoctorMachine, "windowsDrive">,
): MachineWorkspace {
  const drive = computer.windowsDrive?.(workspace.workspace.trust.location) ?? null;
  if (drive === null) return workspace;
  return { ...workspace, workspace: { ...workspace.workspace, windowsDrive: drive } };
}

/**
 * `--json`: every check as the doctor service found it, in the lines' order,
 * with its `check` and `status` (`ok`, `warning` or `failed`), and the counts.
 */
function doctorJson(report: DoctorReport) {
  const { profile, workspace, models, secrets, plugins, sandbox, harnesses } = report;
  const { node, network, disk } = report;
  return {
    checks: [
      profile,
      workspace,
      models,
      secrets,
      plugins,
      sandbox,
      harnesses,
      node,
      network,
      disk,
    ].filter((line) => line !== undefined),
    problems: report.summary.problems,
    warnings: report.summary.warnings,
  };
}
