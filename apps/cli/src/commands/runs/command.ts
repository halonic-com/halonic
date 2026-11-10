import type { CliCommand } from "../../command.ts";
import { runsMessages } from "../../messages/runs.ts";
import { runsListMessages } from "../../messages/runs-list.ts";
import { printable } from "../../output/printable.ts";
import { dirOption, workspaceDir } from "../../workspace-dir.ts";
import { computerRunSetup } from "../run/command.ts";
import type { RunSetup } from "../run/run.ts";
import { listRuns } from "./list.ts";
import { sendToRun } from "./send.ts";
import { showRun } from "./show.ts";

/**
 * `halonic runs`, with the setup passed in so tests can fix the clock, the
 * profile folder, and the engine and trust records `runs send` uses.
 */
export function runsCommandWith(setup: RunSetup): CliCommand {
  return {
    name: "runs",
    usage: "[--status <status>] [--workflow <id>] [--limit <n>] [--dir <folder>]",
    summary: runsMessages.summary(),
    action: (input, context) =>
      runsListMessages.action(printable(workspaceDir(input, context.cwd).name)),
    options: {
      status: {
        type: "string",
        valueName: "status",
        description: runsListMessages.statusOption(),
      },
      workflow: {
        type: "string",
        valueName: "id",
        description: runsListMessages.workflowOption(),
      },
      limit: { type: "string", valueName: "n", description: runsListMessages.limitOption() },
      dir: dirOption,
    },
    subcommands: [showCommandWith(setup), sendCommandWith(setup)],
    run: (input, context) => listRuns(input, context, setup),
  };
}

/** `halonic runs show <run-id>`: what one run did, from its run log (cli-output 3.4). */
function showCommandWith(setup: RunSetup): CliCommand {
  return {
    name: "show",
    usage: "<run-id> [--dir <folder>]",
    summary: runsMessages.showSummary(),
    action: (input) => runsMessages.showAction(printable(input.positionals[0] ?? "")),
    options: { dir: dirOption },
    run: (input, context) => showRun(input, context, setup),
  };
}

/**
 * `halonic runs send <run-id> <event>`: answers a run that's waiting for
 * you (cli-output 3.4, C224).
 */
function sendCommandWith(setup: RunSetup): CliCommand {
  return {
    name: "send",
    usage: "<run-id> <event> [--dir <folder>]",
    summary: runsMessages.sendSummary(),
    action: (input) =>
      runsMessages.sendAction(input.positionals[1] ?? "", input.positionals[0] ?? ""),
    options: { dir: dirOption },
    run: (input, context) => sendToRun(input, context, setup),
  };
}

/** `halonic runs`: the workspace's latest real runs, newest first (cli-output 3.4, C174). */
export const runsCommand: CliCommand = runsCommandWith(computerRunSetup);
