import type { CliCommand } from "../../command.ts";
import { runsMessages } from "../../messages/runs.ts";
import { runsListMessages } from "../../messages/runs-list.ts";
import { dirOption, workspaceDir } from "../../workspace-dir.ts";
import { listRuns, type RunListSetup } from "./list.ts";

/** The list's setup for a real command line: the computer's clock and time zone, and its profile folder. */
const computerSetup: RunListSetup = {
  clock: () => ({ now: new Date() }),
};

/**
 * `halonic runs`, with the setup passed in so tests can fix the clock and
 * the profile folder.
 */
export function runsCommandWith(setup: RunListSetup): CliCommand {
  return {
    name: "runs",
    usage: "[--status <status>] [--workflow <id>] [--limit <n>] [--dir <folder>]",
    summary: runsMessages.summary(),
    action: (input, context) => runsListMessages.action(workspaceDir(input, context.cwd).name),
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
    run: (input, context) => listRuns(input, context, setup),
  };
}

/** `halonic runs`: the workspace's latest real runs, newest first (cli-output 3.4, C174). */
export const runsCommand: CliCommand = runsCommandWith(computerSetup);
