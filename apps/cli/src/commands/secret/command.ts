import type { CliCommand } from "../../command.ts";
import { secretMessages } from "../../messages/secret.ts";
import type { SecretSetup } from "../../secret-host.ts";
import { listSecrets } from "./list.ts";
import { removeSecret } from "./remove.ts";
import { setSecret } from "./set.ts";

/**
 * `halonic secret`, with the setup passed in so tests can fix the profile
 * folder, the password hasher and stdin. Without a subcommand it prints its
 * help.
 */
export function secretCommandWith(setup: SecretSetup): CliCommand {
  return {
    name: "secret",
    usage: "",
    summary: secretMessages.summary(),
    options: {},
    subcommands: [
      {
        name: "set",
        usage: "<name>",
        summary: secretMessages.setSummary(),
        action: () => secretMessages.setAction(),
        options: {},
        run: (input, context) => setSecret(input, context, setup),
      },
      {
        name: "remove",
        usage: "<name>",
        summary: secretMessages.removeSummary(),
        action: () => secretMessages.removeAction(),
        options: {},
        run: (input, context) => removeSecret(input, context, setup),
      },
      {
        name: "list",
        usage: "",
        summary: secretMessages.listSummary(),
        action: () => secretMessages.listAction(),
        options: {},
        run: (input, context) => listSecrets(input, context, setup),
      },
    ],
  };
}

/** `halonic secret`: set, remove or list the secrets kept in this computer's profile. */
export const secretCommand: CliCommand = secretCommandWith({});
