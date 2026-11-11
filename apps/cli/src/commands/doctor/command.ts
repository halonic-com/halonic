import { realpath } from "node:fs/promises";
import { FolderDefinitionStore } from "@halonicjs/adapter-fs-node";
import type { DoctorReport } from "@halonicjs/app";
import { filesOf, loadWorkspace, settingsPath } from "@halonicjs/workspace";
import type { CliCommand, CommandInput } from "../../command.ts";
import { commandPaths, nodeCommandSearch } from "../../command-paths.ts";
import {
  type DoctorMachine,
  doctorService,
  type MachineWorkspace,
  nodeDoctorMachine,
} from "../../doctor-machine.ts";
import { doctorWorkspace } from "../../doctor-workspace.ts";
import { exitCode } from "../../exit-code.ts";
import { doctorMessages } from "../../messages/doctor.ts";
import { doctorReportLines } from "../../output/doctor-report.ts";
import { halonicVersion } from "../../version.ts";
import {
  dirOption,
  NoWorkspaceError,
  type WorkspaceDir,
  workspaceDir,
} from "../../workspace-dir.ts";
import { workspaceIntegrations } from "../../workspace-trust.ts";

/**
 * `halonic doctor [--dir <folder>]` on the computer `machine` reads, so tests
 * can hand it a fake one.
 */
export function createDoctorCommand(machine: () => DoctorMachine): CliCommand {
  return {
    name: "doctor",
    usage: "[--dir <folder>]",
    summary: doctorMessages.summary(),
    action: (input) => doctorMessages.action(givenDir(input)),
    options: { dir: dirOption },
    async run(input, context) {
      const given = givenDir(input);
      const workspace = await readWorkspace(workspaceDir(input, context.cwd), given !== undefined);
      const computer = machine();
      const doctor = await doctorService(computer, context.secrets, workspace);
      const report = await doctor.check(workspace?.workspace ?? null);
      const lines = doctorReportLines(report, {
        version: halonicVersion,
        system: computer.system,
        sandboxKind: computer.sandboxKind,
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
 *
 * @throws NoWorkspaceError when `--dir` was given and has no `workspace.yaml`
 */
async function readWorkspace(
  dir: WorkspaceDir,
  dirGiven: boolean,
): Promise<MachineWorkspace | null> {
  const store = new FolderDefinitionStore(dir.root, dir.shown);
  if ((await store.read(settingsPath)) === null) {
    if (dirGiven) throw new NoWorkspaceError();
    return null;
  }
  const loaded = await loadWorkspace(store);
  const connectors = filesOf(loaded, "connector").map((file) => file.value);
  const workspace = doctorWorkspace({
    workspace: loaded,
    integrations: await workspaceIntegrations(dir.root, dir.shown),
    location: await realpath(dir.root),
    fallbackName: dir.shown,
    commandPaths: await commandPaths(connectors, nodeCommandSearch()),
  });
  const providerFiles = new Map(
    filesOf(loaded, "provider").map((file) => [file.value.id, file.value]),
  );
  return { workspace, providerFiles };
}

/**
 * `--json`: every check as the doctor service found it, in the lines' order,
 * with its `check` and `status` (`ok`, `warning` or `failed`), and the counts.
 */
function doctorJson(report: DoctorReport) {
  const { workspace, models, sandbox, harnesses, disk, summary } = report;
  return {
    checks: [workspace, models, sandbox, harnesses, disk].filter((line) => line !== undefined),
    problems: summary.problems,
    warnings: summary.warnings,
  };
}
