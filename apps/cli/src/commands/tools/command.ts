import type { CliCommand, CliOption, CommandInput } from "../../command.ts";
import { toolsMessages } from "../../messages/tools.ts";
import { printable } from "../../output/printable.ts";
import { dirOption } from "../../workspace-dir.ts";
import { approveTools } from "./approve.ts";
import { reviewTools } from "./review.ts";
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
    usage: "review | approve | revoke",
    summary: toolsMessages.summary(),
    options: {},
    subcommands: [
      {
        name: "review",
        usage: "<source> [--dir <folder>]",
        summary: toolsMessages.reviewSummary(),
        action: listAction,
        options: { dir: dirOption },
        run: (input, context) => reviewTools(input, context, machine()),
      },
      {
        name: "approve",
        usage: "<source> <tool>... [--fingerprint <fingerprint>] | <source> --all [--dir <folder>]",
        summary: toolsMessages.approveSummary(),
        action: listAction,
        options: {
          dir: dirOption,
          all: { type: "boolean", description: toolsMessages.allOption() },
          fingerprint: fingerprintOption,
        },
        run: (input, context) => approveTools(input, context, machine()),
      },
      {
        name: "revoke",
        usage: "<source> <tool>... [--dir <folder>]",
        summary: toolsMessages.revokeSummary(),
        action: listAction,
        options: { dir: dirOption },
        run: (input, context) => revokeTools(input, context, machine()),
      },
    ],
  };
}

const fingerprintOption: CliOption = {
  type: "string",
  valueName: "fingerprint",
  description: toolsMessages.fingerprintOption(),
};

/** "list the tools from notes-mcp", for line 1 of an error the command didn't word itself. */
function listAction(input: CommandInput) {
  const [source] = input.positionals;
  return toolsMessages.action(source === undefined ? undefined : printable(source));
}

/** `halonic tools`: review, approve and remove the approvals of a connector's listed tools (HAL-2827). */
export const toolsCommand: CliCommand = toolsCommandWith(nodeToolsMachine);
