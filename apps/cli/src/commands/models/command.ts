import type { CliCommand } from "../../command.ts";
import { modelsMessages } from "../../messages/models.ts";
import type { SecretSetup } from "../../secret-host.ts";
import { allowAddress } from "./allow-address.ts";

/**
 * `halonic models`, with the setup passed in so tests can fix the profile
 * folder and the environment. Without a subcommand it prints its help.
 */
export function modelsCommandWith(setup: SecretSetup): CliCommand {
  return {
    name: "models",
    usage: "",
    summary: modelsMessages.summary(),
    options: {},
    subcommands: [
      {
        name: "allow-address",
        usage: "<key-name> <address>",
        summary: modelsMessages.allowAddressSummary(),
        options: {},
        run: (input, context) => allowAddress(input, context, setup),
      },
    ],
  };
}

/** `halonic models`: where a provider may send a stored key. */
export const modelsCommand: CliCommand = modelsCommandWith({});
