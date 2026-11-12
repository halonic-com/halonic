import type { CliCommand, CommandInput } from "../../command.ts";
import { toolsMessages } from "../../messages/tools.ts";
import { printable } from "../../output/printable.ts";
import { dirOption } from "../../workspace-dir.ts";
import { revokeTools } from "./revoke.ts";
import { nodeToolsMachine, type ToolsMachine } from "./source.ts";

/**
 * `halonic tools`, with the machine passed in so tests can fix the servers,
 * the clock, and the trust and approval stores. On its own it prints its
 * help, as a command that only hands off does.
 */
export function toolsCommandWith(machine: () => ToolsMachine): CliCommand {
  return {
    name: "tools",
    usage: "revoke",
    summary: toolsMessages.summary(),
    options: {},
    subcommands: [
      {
        name: "revoke",
        usage: "<source> <tool>... [--dir <folder>]",
        summary: toolsMessages.revokeSummary(),
        action: revokeAction,
        options: { dir: dirOption },
        run: (input, context) => revokeTools(input, context, machine()),
      },
    ],
  };
}

/** "remove your approvals in notes-mcp", for line 1 of an error the command didn't word itself. */
function revokeAction(input: CommandInput) {
  const [source] = input.positionals;
  return toolsMessages.revokeAction(source === undefined ? undefined : printable(source));
}

/** `halonic tools`: review, approve and remove the approvals of a connector's listed tools (HAL-2827). */
export const toolsCommand: CliCommand = toolsCommandWith(nodeToolsMachine);
