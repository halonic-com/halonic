// `halonic secret remove <name>`: removes a saved secret. A thin command over
// `SecretService.remove`. Removing a name that isn't saved succeeds, so a
// second run finishes what a first left undone.

import {
  type CommandContext,
  type CommandInput,
  type CommandResult,
  UsageError,
} from "../../command.ts";
import { exitCode } from "../../exit-code.ts";
import { secretMessages } from "../../messages/secret.ts";
import { printable } from "../../output/printable.ts";
import { openSecretService, type SecretSetup } from "../../secret-host.ts";
import { refused } from "./set.ts";

/**
 * Removes the secret `name`.
 *
 * @throws UsageError without a name, with more than one, or when the service refuses the name
 */
export async function removeSecret(
  input: CommandInput,
  _context: CommandContext,
  setup: SecretSetup,
): Promise<CommandResult> {
  const [name, ...extra] = input.positionals;
  if (name === undefined || extra.length > 0) {
    throw new UsageError(secretMessages.removeNeedsName(), secretMessages.removeUsage());
  }
  const change = await openSecretService(setup).remove(name);
  if (!change.changed) {
    throw refused(change.reason);
  }
  return {
    exitCode: exitCode.ok,
    lines: [secretMessages.removed(printable(name)).phrase],
    json: { name, removed: true },
  };
}
