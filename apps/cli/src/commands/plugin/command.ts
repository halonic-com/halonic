import type { CliCommand } from "../../command.ts";
import { pluginMessages } from "../../messages/plugin.ts";
import { trustMessages } from "../../messages/trust.ts";
import type { PluginSetup } from "../../plugin-host.ts";
import { addPlugin } from "./add.ts";
import { listPlugins } from "./list.ts";

/**
 * `halonic plugin`, with the setup passed in so tests can fix the profile
 * folder and the clock. Without a subcommand it lists the plugins.
 */
export function pluginCommandWith(setup: PluginSetup): CliCommand {
  return {
    name: "plugin",
    usage: "",
    summary: pluginMessages.summary(),
    action: () => pluginMessages.listAction(),
    options: {},
    subcommands: [addCommandWith(setup), listCommandWith(setup)],
    run: (input, context) => listPlugins(input, context, setup),
  };
}

/** `halonic plugin add <folder>`: copies the plugin into the profile, shows its trust check and asks (cli-output 3.6). */
function addCommandWith(setup: PluginSetup): CliCommand {
  return {
    name: "add",
    usage: "<folder> [--yes --fingerprint <fingerprint>]",
    summary: pluginMessages.addSummary(),
    action: () => pluginMessages.addAction(),
    options: {
      yes: { type: "boolean", description: trustMessages.yesOption() },
      fingerprint: {
        type: "string",
        valueName: "fingerprint",
        description: trustMessages.fingerprintOption(),
      },
    },
    run: (input, context) => addPlugin(input, context, setup),
  };
}

/** `halonic plugin list`: the plugins in the profile and whether each is on (cli-output 3.6). */
function listCommandWith(setup: PluginSetup): CliCommand {
  return {
    name: "list",
    usage: "",
    summary: pluginMessages.listSummary(),
    action: () => pluginMessages.listAction(),
    options: {},
    run: (input, context) => listPlugins(input, context, setup),
  };
}

/** `halonic plugin`: add or list plugins in this computer's profile. */
export const pluginCommand: CliCommand = pluginCommandWith({});
