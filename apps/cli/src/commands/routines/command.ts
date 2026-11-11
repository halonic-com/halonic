import type { CliCommand } from "../../command.ts";
import { routinesMessages } from "../../messages/routines.ts";
import { printable } from "../../output/printable.ts";
import { dirOption, workspaceDir } from "../../workspace-dir.ts";
import { computerRunSetup } from "../run/command.ts";
import type { RunSetup } from "../run/run.ts";
import { listRoutines } from "./list.ts";
import { watchRoutines } from "./watch.ts";

/**
 * `halonic routines`, with the setup passed in so tests can fix the clock,
 * its time zone, the profile folder that holds the runs, and the engine and
 * trust records `routines watch` uses.
 */
export function routinesCommandWith(setup: RunSetup): CliCommand {
  return {
    name: "routines",
    usage: "[--dir <folder>]",
    summary: routinesMessages.summary(),
    action: (input, context) =>
      routinesMessages.action(printable(workspaceDir(input, context.cwd).name)),
    options: { dir: dirOption },
    subcommands: [watchCommandWith(setup)],
    run: (input, context) => listRoutines(input, context, setup),
  };
}

/**
 * `halonic routines watch`: starts the routines on time until Ctrl C, and
 * moves on the runs that wait for a time.
 */
function watchCommandWith(setup: RunSetup): CliCommand {
  return {
    name: "watch",
    usage: "[--dir <folder>]",
    summary: routinesMessages.watchSummary(),
    action: (input, context) =>
      routinesMessages.watchAction(printable(workspaceDir(input, context.cwd).name)),
    options: { dir: dirOption },
    run: (input, context) => watchRoutines(input, context, setup),
  };
}

/** `halonic routines`: the workspace's routines with their next and last run (HAL-4844). */
export const routinesCommand: CliCommand = routinesCommandWith(computerRunSetup);
