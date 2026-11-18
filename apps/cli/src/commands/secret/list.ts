// `halonic secret list`: the names of the saved secrets, never a value. A
// thin command over `SecretService.list`.

import type { CommandContext, CommandInput, CommandResult } from "../../command.ts";
import { exitCode } from "../../exit-code.ts";
import { phrase } from "../../messages/phrase.ts";
import { secretMessages } from "../../messages/secret.ts";
import { printable } from "../../output/printable.ts";
import { openSecretService, type SecretSetup } from "../../secret-host.ts";

/**
 * Lists the saved secrets' names, one per line, in name order. No secrets
 * says so, and exits 0. An argument never reaches it: `runCli` refuses
 * one, as for every command that takes none.
 */
export async function listSecrets(
  _input: CommandInput,
  _context: CommandContext,
  setup: SecretSetup,
): Promise<CommandResult> {
  const names = await openSecretService(setup).list();
  return {
    exitCode: exitCode.ok,
    lines:
      names.length === 0
        ? [secretMessages.noSecrets().phrase]
        : names.map((name) => phrase`${printable(name)}`),
    json: { secrets: names },
  };
}
