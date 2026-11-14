// `halonic secret list`: the names of the saved secrets, never a value. A
// thin command over `SecretService.list`.

import {
  type CommandContext,
  type CommandInput,
  type CommandResult,
  UsageError,
} from "../../command.ts";
import { exitCode } from "../../exit-code.ts";
import { phrase } from "../../messages/phrase.ts";
import { secretMessages } from "../../messages/secret.ts";
import { printable } from "../../output/printable.ts";
import { openSecretService, type SecretSetup } from "../../secret-host.ts";

/**
 * Lists the saved secrets' names, one per line, in name order. No secrets
 * says so, and exits 0.
 *
 * @throws UsageError when given an argument
 */
export async function listSecrets(
  input: CommandInput,
  _context: CommandContext,
  setup: SecretSetup,
): Promise<CommandResult> {
  if (input.positionals.length > 0) {
    throw new UsageError(secretMessages.listTakesNone(), secretMessages.listUsage());
  }
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
