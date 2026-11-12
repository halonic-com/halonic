// `halonic tools revoke <source> <tool>…` (cli-output 3.10): removes an
// approval, so the tool is off until a person approves it again. It reads
// only the approvals, so it starts no connector and needs no trust.

import { hasToolApproval, revokeNamedTool } from "@halonicjs/app";
import {
  type CommandContext,
  type CommandInput,
  type CommandResult,
  OwnLineError,
  UsageError,
} from "../../command.ts";
import { exitCode } from "../../exit-code.ts";
import { markPart, type Phrase, phrase } from "../../messages/phrase.ts";
import { toolsMessages } from "../../messages/tools.ts";
import { printable } from "../../output/printable.ts";
import { openToolSource, type ToolsMachine } from "./source.ts";

/**
 * Removes the approval of each tool named, in order, one line each. It
 * checks every name first: when one isn't approved, it removes none and
 * ends with that tool's error (exit 4), so `--json` never leaves out an
 * approval it removed.
 *
 * @throws UsageError when no tool is named
 */
export async function revokeTools(
  input: CommandInput,
  context: CommandContext,
  machine: ToolsMachine,
): Promise<CommandResult> {
  const names = input.positionals.slice(1);
  if (input.positionals.length > 0 && names.length === 0) {
    throw new UsageError(toolsMessages.nameToolsToRevoke());
  }
  const source = await openToolSource(input, context, "revoke");
  const keyOf = (name: string) => ({
    location: source.location,
    source: source.connector.id,
    name,
  });
  for (const name of names) {
    if (!(await hasToolApproval(machine.approvals, keyOf(name)))) {
      throw new OwnLineError(
        "not_found",
        toolsMessages.notApprovedToRevoke(printable(name), source.shown),
      );
    }
  }
  const lines: Phrase[] = [];
  const revoked: string[] = [];
  for (const name of names) {
    await revokeNamedTool(machine.approvals, keyOf(name));
    const line = phrase`${markPart("done")} ${toolsMessages.revoked(printable(name), source.shown).phrase}`;
    context.printAhead(line);
    lines.push(line);
    revoked.push(name);
  }
  return { exitCode: exitCode.ok, lines, json: { revoked } };
}
