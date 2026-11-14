import type { CliCommand } from "../../command.ts";
import type { ConnectionSetup } from "../../connection-settings-host.ts";
import { googleMessages } from "../../messages/google.ts";
import { dirOption } from "../../workspace-dir.ts";
import { allowSending } from "./allow-sending.ts";

/**
 * `halonic google`, with the setup passed in so tests can fix the profile
 * folder and the clock. Without a subcommand it prints its help.
 */
export function googleCommandWith(setup: ConnectionSetup): CliCommand {
  return {
    name: "google",
    usage: "",
    summary: googleMessages.summary(),
    options: {},
    subcommands: [
      {
        name: "allow-sending",
        usage: "<connection> on|off",
        summary: googleMessages.allowSendingSummary(),
        action: () => googleMessages.allowSendingAction(),
        options: { dir: dirOption },
        run: (input, context) => allowSending(input, context, setup),
      },
    ],
  };
}

/** `halonic google`: choose what Halonic may do with a Google connection. */
export const googleCommand: CliCommand = googleCommandWith({});
