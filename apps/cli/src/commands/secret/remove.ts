// `halonic secret remove <name>`: removes a saved secret. A thin command over
// `SecretService.remove`. Removing a name that isn't saved succeeds, so a
// second run finishes what a first left undone, but it says that nothing was
// saved, so "Removed" never stands for nothing (C605 #6c), and how to list the
// names that are, since the usual cause is a typo or the wrong store (C633 1).
// A `HALONIC_SECRET_<NAME>` variable still holding it is named instead, because
// runs read it from there and remove can't clear it (C631 P1).

import { EnvSecrets, secretVariableName } from "@halonicjs/adapter-env-secrets";
import {
  type CommandContext,
  type CommandInput,
  type CommandResult,
  UsageError,
} from "../../command.ts";
import { exitCode } from "../../exit-code.ts";
import type { Phrase } from "../../messages/phrase.ts";
import { secretMessages } from "../../messages/secret.ts";
import { printable } from "../../output/printable.ts";
import { openSecretService, type SecretSetup } from "../../secret-host.ts";
import { refused } from "./set.ts";

/**
 * Removes the secret `name`.
 *
 * @throws UsageError without a name, or with more than one
 * @throws OwnLineError when the service refuses the name
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
  if ("notSaved" in change) {
    return {
      exitCode: exitCode.ok,
      lines: await notSavedLines(name, setup),
      json: { name, removed: false },
    };
  }
  if (!change.changed) {
    throw refused(change.reason);
  }
  return {
    exitCode: exitCode.ok,
    lines: [secretMessages.removed(printable(name)).phrase],
    json: { name, removed: true },
  };
}

/**
 * "… isn't set" and how to list the names that are, or, when a variable still holds the secret,
 * "No secret … is saved." and that variable: saying "isn't set" there would be wrong.
 */
async function notSavedLines(name: string, setup: SecretSetup): Promise<Phrase[]> {
  const environment = setup.environment ?? process.env;
  if ((await new EnvSecrets(environment).get(name)) === null) {
    return [secretMessages.notSaved(printable(name)).phrase];
  }
  return [
    secretMessages.notSavedButInVariable(printable(name)).phrase,
    secretMessages.stillInVariable(secretVariableName(name), printable(name)).phrase,
  ];
}
