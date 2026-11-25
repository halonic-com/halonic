import type { CliCommand } from "../../command.ts";
import { buildMessages } from "../../messages/build.ts";
import { dirOption } from "../../workspace-dir.ts";
import { buildPaperclipPlugin, type PluginBuildSetup } from "./paperclip-plugin.ts";

/**
 * `halonic build`, with the setup passed in so tests can fix the runtime
 * and the git. Without a subcommand it prints its help. `--plugin-version`
 * and not `--version`, which every command reads as "show Halonic's version".
 */
export function buildCommandWith(setup: PluginBuildSetup): CliCommand {
  return {
    name: "build",
    usage: "",
    summary: buildMessages.summary(),
    options: {},
    subcommands: [
      {
        name: "paperclip-plugin",
        usage: "[--dir <folder>] [--out <folder>] [--since <file>] [--plugin-version <x.y.z>]",
        summary: buildMessages.pluginSummary(),
        action: () => buildMessages.pluginAction(),
        options: {
          dir: dirOption,
          out: { type: "string", valueName: "folder", description: buildMessages.outOption() },
          since: {
            type: "string",
            valueName: "file",
            description: buildMessages.sinceOption(),
          },
          "plugin-version": {
            type: "string",
            valueName: "x.y.z",
            description: buildMessages.pluginVersionOption(),
          },
        },
        run: (input, context) => buildPaperclipPlugin(input, context, setup),
      },
    ],
  };
}

/** `halonic build`: build something from the workspace to install elsewhere, never installing it. */
export const buildCommand: CliCommand = buildCommandWith({});
