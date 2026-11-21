import { FileTrustStore } from "@halonicjs/adapter-fs-node";
import { profileFolder, trustFolder } from "@halonicjs/profile";
import { systemClock } from "@halonicjs/std";
import type { CliCommand } from "../../command.ts";
import { nodeCommandSearch } from "../../command-paths.ts";
import { engineHttp } from "../../engine-http.ts";
import { nodeHarnessPrograms } from "../../harness-programs.ts";
import { inputValueName, runMessages } from "../../messages/run.ts";
import { nodeSandboxWorks } from "../../sandbox-works.ts";
import { installedPluginHosts } from "../../sheet-hosts.ts";
import { dirOption } from "../../workspace-dir.ts";
import { nodeProfileEnvironment } from "../../workspace-runs.ts";
import { runWorkflow } from "./instructions-prompt.ts";
import type { RunSetup } from "./run.ts";

/**
 * This computer: its clock and time zone, its trust records, `PATH`, its
 * harness programs and its proxied `fetch`. `halonic runs send` moves a run on with the
 * same.
 */
export const computerRunSetup: RunSetup = {
  clock: () => ({ now: new Date() }),
  trust: () => ({
    trustStore: new FileTrustStore(trustFolder(profileFolder(nodeProfileEnvironment()))),
    clock: systemClock,
    commandSearch: nodeCommandSearch(),
    sandboxWorks: nodeSandboxWorks,
    pluginHosts: () => installedPluginHosts(),
  }),
  http: engineHttp(),
  harnesses: nodeHarnessPrograms,
};

/**
 * `halonic run <workflow>`, with the setup passed in so tests can fix the
 * clock, the ids, the trust records and the profile folder.
 */
export function runCommandWith(setup: RunSetup): CliCommand {
  return {
    name: "run",
    usage: `<workflow> [--dir <folder>] [--input <${inputValueName}>] [--event <event>]... [--harness <harness>] [--follow]`,
    takesArguments: true,
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
      harness: {
        type: "string",
        valueName: "harness",
        description: runMessages.harnessOption(),
      },
      follow: { type: "boolean", description: runMessages.followOption() },
    },
    jsonLinesOption: "follow",
    run: (input, context) => runWorkflow(input, context, setup),
  };
}

/** `halonic run <workflow>`: runs a workflow and follows it step by step (cli-output 3.4). */
export const runCommand: CliCommand = runCommandWith(computerRunSetup);
