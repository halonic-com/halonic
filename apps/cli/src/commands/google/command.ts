import type { CliCommand } from "../../command.ts";
import type { ConnectionSetup } from "../../connection-settings-host.ts";
import type { GoogleSetup } from "../../google-host.ts";
import { googleMessages } from "../../messages/google.ts";
import { dirOption } from "../../workspace-dir.ts";
import { allowSending } from "./allow-sending.ts";
import { resetGoogle } from "./reset.ts";
import { saveGoogleSecret } from "./secret.ts";
import { type GoogleSignInMachine, signInGoogle } from "./sign-in.ts";

/**
 * `halonic google`, with the setup passed in so tests can fix the profile
 * folder and the clock. Without a subcommand it prints its help.
 */
export function googleCommandWith(
  setup: ConnectionSetup & GoogleSetup & GoogleSignInMachine,
): CliCommand {
  return {
    name: "google",
    usage: "",
    summary: googleMessages.summary(),
    options: {},
    subcommands: [
      {
        name: "allow-sending",
        usage: "<connection> on|off [--dir <folder>]",
        takesArguments: true,
        summary: googleMessages.allowSendingSummary(),
        action: () => googleMessages.allowSendingAction(),
        options: { dir: dirOption },
        run: (input, context) => allowSending(input, context, setup),
      },
      {
        name: "reset",
        usage: "[--yes]",
        summary: googleMessages.resetSummary(),
        action: () => googleMessages.resetAction(),
        options: {
          yes: { type: "boolean", description: googleMessages.resetYesOption() },
        },
        run: (input, context) => resetGoogle(input, context, setup),
      },
      {
        name: "secret",
        usage: "<account>",
        takesArguments: true,
        summary: googleMessages.secretSummary(),
        action: () => googleMessages.secretAction(),
        options: {},
        run: (input, context) => saveGoogleSecret(input, context, setup),
      },
      {
        name: "sign-in",
        usage: "<account> [--connection <id>] [--dir <folder>]",
        takesArguments: true,
        summary: googleMessages.signInSummary(),
        action: () => googleMessages.signInAction(),
        options: {
          connection: {
            type: "string",
            valueName: "id",
            description: googleMessages.signInConnectionOption(),
          },
          dir: dirOption,
        },
        run: (input, context) => signInGoogle(input, context, setup),
      },
    ],
  };
}

/** `halonic google`: choose what Halonic may do with a Google connection. */
export const googleCommand: CliCommand = googleCommandWith({});
