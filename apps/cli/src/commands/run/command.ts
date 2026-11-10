import { FileTrustStore } from "@halonicjs/adapter-fs-node";
import { profileFolder, trustFolder } from "@halonicjs/profile";
import { systemClock } from "@halonicjs/std";
import type { CliCommand } from "../../command.ts";
import { nodeCommandSearch } from "../../command-paths.ts";
import { inputValueName, runMessages } from "../../messages/run.ts";
import { dirOption } from "../../workspace-dir.ts";
import { nodeProfileEnvironment } from "../../workspace-runs.ts";
import { type RunSetup, runWorkflow } from "./run.ts";

/** This computer: its clock and time zone, its trust records, `PATH` and `fetch`. */
const computerSetup: RunSetup = {
  clock: () => ({ now: new Date() }),
  trust: () => ({
    trustStore: new FileTrustStore(trustFolder(profileFolder(nodeProfileEnvironment()))),
    clock: systemClock,
    commandSearch: nodeCommandSearch(),
  }),
  http: { fetch: (url, init) => fetch(url, init) },
};

/**
 * `halonic run <workflow>`, with the setup passed in so tests can fix the
 * clock, the ids, the trust records and the profile folder.
 */
export function runCommandWith(setup: RunSetup): CliCommand {
  return {
    name: "run",
    usage: `<workflow> [--dir <folder>] [--input <${inputValueName}>] [--event <event>]...`,
    summary: runMessages.summary(),
    action: (input) => runMessages.action(input.positionals[0] ?? ""),
    options: {
      dir: dirOption,
      input: { type: "string", valueName: inputValueName, description: runMessages.inputOption() },
      event: {
        type: "string",
        multiple: true,
        valueName: "event",
        description: runMessages.eventOption(),
      },
    },
    run: (input, context) => runWorkflow(input, context, setup),
  };
}

/** `halonic run <workflow>`: runs a workflow and follows it step by step (cli-output 3.4). */
export const runCommand: CliCommand = runCommandWith(computerSetup);
