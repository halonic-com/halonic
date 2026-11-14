// `halonic google secret <account>`: saves the Google client secret of an
// account that was set up in the Studio. The value comes from the hidden
// prompt only, never from an argument, an environment variable or a pipe, so
// it isn't in shell history. It is saved by the same rules as the Studio's
// `PUT /api/google/setups/<ref>/secret`, and nothing but "Saved" is printed.

import {
  type CommandContext,
  type CommandInput,
  type CommandResult,
  OwnLineError,
  UsageError,
} from "../../command.ts";
import { exitCode } from "../../exit-code.ts";
import { type GoogleSetup, openGoogleHost } from "../../google-host.ts";
import { googleMessages } from "../../messages/google.ts";
import { readSetup } from "./read-setup.ts";

/**
 * Saves the client secret typed at the hidden prompt for the account whose
 * setup record has the given ref. A first secret is saved; a secret that was
 * saved before is replaced only while the account has never signed in and no
 * other account shares the client, as in the Studio.
 *
 * @throws UsageError without an account, with a value as an argument, or
 *   when nobody can type one (no terminal, `CI` or `--json`)
 * @throws OwnLineError `not_found` when no setup has that ref, `conflict` when
 *   the secret may only be replaced through staging, `invalid_input` when the
 *   token key isn't set
 */
export async function saveGoogleSecret(
  input: CommandInput,
  context: CommandContext,
  setup: GoogleSetup,
): Promise<CommandResult> {
  const [accountRef, ...extra] = input.positionals;
  if (accountRef === undefined) {
    throw new UsageError(googleMessages.secretNeedsAccount(), googleMessages.secretUsage());
  }
  if (extra.length > 0) {
    throw new UsageError(googleMessages.secretAsArgument(), googleMessages.secretAsArgumentFix());
  }
  const host = openGoogleHost(setup);
  const record = await readSetup(host.setups, accountRef);
  if (!(await host.tokenKeyIsSet())) {
    throw new OwnLineError(
      "invalid_input",
      googleMessages.secretNeedsTokenKey(),
      googleMessages.secretNeedsTokenKeyFix(),
    );
  }
  const value = await context.askSecret(
    googleMessages.secretPrompt(),
    () => new UsageError(googleMessages.secretNoTerminal(), googleMessages.secretNoTerminalFix()),
  );
  if (value === undefined || value.trim() === "") {
    throw new UsageError(googleMessages.secretNoValue(), googleMessages.secretUsage());
  }
  if (record.clientSecret === null) {
    const clientRef = await host.clientSecrets.saveClientSecret(value);
    await host.setups.update(accountRef, { kind: "client-secret-saved", clientRef });
  } else {
    const { clientRef } = record.clientSecret;
    const sharedOrSignedIn =
      record.lastSignInAt !== null || (await host.setups.usingClient(clientRef)).length > 1;
    if (sharedOrSignedIn) {
      throw new OwnLineError(
        "conflict",
        googleMessages.secretNeedsStaging(),
        googleMessages.secretNeedsStagingFix(),
      );
    }
    await host.clientSecrets.replaceClientSecret(clientRef, value);
    await host.setups.update(accountRef, { kind: "client-secret-saved", clientRef });
  }
  return {
    exitCode: exitCode.ok,
    lines: [googleMessages.secretSaved().phrase],
    json: { saved: true },
  };
}
