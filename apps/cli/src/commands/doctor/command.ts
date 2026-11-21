import { readFile, realpath } from "node:fs/promises";
import { join } from "node:path";
import { FolderDefinitionStore } from "@halonicjs/adapter-fs-node";
import type { DoctorReport, DoctorWorkspace } from "@halonicjs/app";
import { type Secrets, workspaceSecrets } from "@halonicjs/ports";
import { filesOf, type LoadedWorkspace, loadWorkspace, settingsPath } from "@halonicjs/workspace";
import { cliProviderKeys } from "../../cli-provider-keys.ts";
import type { CliCommand, CommandInput } from "../../command.ts";
import { commandPaths, nodeCommandSearch } from "../../command-paths.ts";
import {
  type DoctorMachine,
  doctorService,
  type MachineWorkspace,
  nodeDoctorMachine,
  trustedOnMachine,
  withHarnessSettingsFolders,
} from "../../doctor-machine.ts";
import { agentsWithProviderKey } from "../../doctor-provider-keys.ts";
import { doctorWorkspace } from "../../doctor-workspace.ts";
import { exitCode } from "../../exit-code.ts";
import { doctorMessages } from "../../messages/doctor.ts";
import { doctorReportLines } from "../../output/doctor-report.ts";
import { studioWatchedFileLimit } from "../../studio-watch-limit.ts";
import { halonicVersion } from "../../version.ts";
import {
  dirOption,
  NoWorkspaceError,
  type WorkspaceDir,
  workspaceDir,
} from "../../workspace-dir.ts";
import { workspaceIntegrations } from "../../workspace-trust.ts";

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
      const read = await readWorkspace(
        workspaceDir(input, context.cwd),
        given !== undefined,
        watchedFileLimit,
        computer,
        secrets,
      );
      const workspace =
        read === null
          ? null
          : await withHarnessSettingsFolders(withWindowsDrive(read, computer), computer.profile);
      // The store as a run reads it, so `doctor` can't call set a name a run refuses.
      const doctor = await doctorService(computer, secrets, workspace);
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
 * The workspace in `dir`, or `null` when there's none: then `doctor` checks
 * only the computer. A `--dir` that holds no workspace is a mistake, though.
 * It counts the workspace's files up to `watchedFileLimit`, so the Workspace
 * line can say when Studio won't watch the folder (HAL-12295). With the
 * person's placement choices, it finds the harness agents whose runs get a
 * provider key, so the Harnesses line doesn't ask about their own sign-in
 * (HAL-14661).
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
  const store = new FolderDefinitionStore(dir.root, dir.shown);
  if ((await store.read(settingsPath)) === null) {
    if (dirGiven) throw new NoWorkspaceError();
    return null;
  }
  const loaded = await loadWorkspace(store);
  const connectors = filesOf(loaded, "connector").map((file) => file.value);
  const location = await realpath(dir.root);
  const found = doctorWorkspace({
    workspace: loaded,
    integrations: await workspaceIntegrations(dir.root, dir.shown),
    location,
    fallbackName: dir.name,
    commandPaths: await commandPaths(connectors, nodeCommandSearch()),
  });
  const workspace = {
    ...found,
    ...(await providerKeyAgents(computer, secrets, loaded, found, location)),
  };
  const tooManyToWatch = await store.hasMoreFilesThan(watchedFileLimit);
  const providerFiles = new Map(
    filesOf(loaded, "provider").map((file) => [file.value.id, file.value]),
  );
  return {
    workspace: tooManyToWatch ? { ...workspace, tooManyFilesToWatch: watchedFileLimit } : workspace,
    providerFiles,
  };
}

/**
 * The harness agents whose runs get a provider key, decided with the CLI's
 * own key services as `run` builds them, with the person's placement choices,
 * the workspace's trust and the keys' allowed addresses. Without the choices
 * or the addresses, nothing, so the Harnesses line asks about every agent.
 */
async function providerKeyAgents(
  computer: DoctorMachine,
  secrets: Secrets,
  loaded: LoadedWorkspace,
  found: DoctorWorkspace,
  location: string,
): Promise<Pick<DoctorWorkspace, "agentsWithProviderKey">> {
  const { placement, keyOrigins } = computer;
  if (placement === undefined || keyOrigins === undefined) return {};
  const keys = cliProviderKeys({
    workspace: () => loaded,
    secrets,
    trusted: await trustedOnMachine(computer, found),
    keyOrigins,
  });
  return {
    agentsWithProviderKey: await agentsWithProviderKey({
      workspace: loaded,
      placement,
      location,
      readFile: async (path) => new Uint8Array(await readFile(join(location, path))),
      access: (agent) => keys.accessFor(agent),
    }),
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
  const { workspace, models, secrets, sandbox, harnesses, node, network, disk, summary } = report;
  return {
    checks: [workspace, models, secrets, sandbox, harnesses, node, network, disk].filter(
      (line) => line !== undefined,
    ),
    problems: summary.problems,
    warnings: summary.warnings,
  };
}
