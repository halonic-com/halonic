// `halonic google allow-sending <connection> on|off`: switches sending on or
// off for one Google connection of the workspace. A thin command over
// `ConnectionSettings.setAllowSending`: it finds the connection, the
// service saves the person's choice, and this file says what happened.
// Nothing here switches sending on by itself.

import { realpath } from "node:fs/promises";
import { filesOf, loadWorkspace } from "@halonicjs/workspace";
import {
  type CommandContext,
  type CommandInput,
  type CommandResult,
  OwnLineError,
  UsageError,
} from "../../command.ts";
import { type ConnectionSetup, openConnectionSettings } from "../../connection-settings-host.ts";
import { exitCode } from "../../exit-code.ts";
import { googleMessages } from "../../messages/google.ts";
import { nearMatch } from "../../near-match.ts";
import { printable } from "../../output/printable.ts";
import { openWorkspaceDir } from "../../workspace-dir.ts";
import { workspaceNameOf } from "../../workspace-trust.ts";

/**
 * Switches sending on or off for the connection named first, in the
 * workspace of `--dir` (the current folder without it). Doing it again with
 * the same word still succeeds.
 *
 * @throws UsageError without a connection and `on` or `off`, or with more
 * @throws OwnLineError `not_found` when the workspace has no connection by that id
 * @throws OwnLineError `invalid_input` when the connection isn't a Google one
 */
export async function allowSending(
  input: CommandInput,
  context: CommandContext,
  setup: ConnectionSetup,
): Promise<CommandResult> {
  const [typed, word, ...extra] = input.positionals;
  if (typed === undefined || (word !== "on" && word !== "off") || extra.length > 0) {
    throw new UsageError(
      googleMessages.allowSendingNeedsMore(),
      googleMessages.allowSendingUsage(),
    );
  }
  const dir = await openWorkspaceDir(input, context);
  const workspace = await loadWorkspace(dir.store);
  const name = workspaceNameOf(workspace, dir);
  const connections = filesOf(workspace, "connector").map((file) => file.value);
  const connection = connections.find((candidate) => candidate.id === typed);
  if (connection === undefined) {
    const near = nearMatch(
      typed,
      connections.map((candidate) => candidate.id),
    );
    throw new OwnLineError(
      "not_found",
      googleMessages.unknownConnection(printable(typed), printable(name)),
      near === undefined
        ? googleMessages.seeConnections()
        : googleMessages.didYouMean(printable(near)),
    );
  }
  if (!("google" in connection.transport)) {
    throw new OwnLineError(
      "invalid_input",
      googleMessages.notGoogle(printable(typed)),
      googleMessages.notGoogleFix(),
    );
  }
  const allowed = word === "on";
  await openConnectionSettings(setup).setAllowSending(
    { location: await realpath(dir.root), connector: connection.id },
    allowed,
  );
  const sentence = allowed ? googleMessages.sendingOn : googleMessages.sendingOff;
  return {
    exitCode: exitCode.ok,
    lines: [sentence(printable(typed), printable(name)).phrase],
    json: { connection: connection.id, workspace: name, allowSending: allowed },
  };
}
