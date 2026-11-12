// `halonic trust --plugin <id> [--remove]`: turns on, or off, a plugin that
// is already in the profile's plugins folder (cli-output 3.6). A thin command
// over `PluginService.trust` and `revoke`: it asks the same question as
// `plugin add`, through the same code, so the two can't drift apart.

import type { PluginEntry, PluginService } from "@halonicjs/app";
import { KindedError } from "@halonicjs/std";
import {
  type CommandContext,
  type CommandInput,
  type CommandResult,
  UsageError,
} from "../../command.ts";
import { exitCode } from "../../exit-code.ts";
import type { Message } from "../../messages/define.ts";
import { markPart, phrase, plainText } from "../../messages/phrase.ts";
import { pluginMessages } from "../../messages/plugin.ts";
import { trustMessages } from "../../messages/trust.ts";
import { nearMatch } from "../../near-match.ts";
import { printable } from "../../output/printable.ts";
import { shownDate } from "../../output/trust-check.ts";
import { openPluginService, type PluginSetup } from "../../plugin-host.ts";
import {
  askToTrustPlugin,
  brokenPluginError,
  fingerprintNotCurrent,
} from "../../plugin-trust-question.ts";

/** The options `--plugin` can't go with: they name workspaces, and a plugin id is never one. */
const workspaceOptions = ["dir", "list"] as const;

/**
 * Shows the trust check of the plugin `id` and asks whether to trust it and
 * turn it on, or with `--remove` forgets the trust, so it is off. Already on
 * says so and asks nothing, unless the `--fingerprint` given isn't current.
 *
 * @throws UsageError for `--plugin` with `--dir` or `--list`, or `--yes` without `--fingerprint`
 * @throws KindedError when no plugin has the id, or it can't be read or checked
 * @throws NotTrustedError when it stays as it is because nobody could answer
 *   or the `--fingerprint` isn't the current one, also when it is already on
 */
export async function trustPlugin(
  id: string,
  input: CommandInput,
  context: CommandContext,
  setup: PluginSetup,
): Promise<CommandResult> {
  const given = input.options["fingerprint"];
  const fingerprint = typeof given === "string" ? given : undefined;
  const yes = input.options["yes"] === true;
  const workspaceOption = workspaceOptions.find((option) => isGiven(input.options[option]));
  if (workspaceOption !== undefined) {
    throw new UsageError(
      pluginMessages.trustPluginWith(workspaceOption),
      pluginMessages.trustPluginWithFix(),
    );
  }
  const service = openPluginService(setup);
  if (input.options["remove"] === true) {
    // Like workspace `trust --remove`: nothing is asked, so `--yes` and
    // `--fingerprint` have nothing to answer and are ignored.
    return await removeTrust(service, await findPlugin(service, id));
  }
  if (yes && fingerprint === undefined) {
    throw new UsageError(
      trustMessages.yesNeedsFingerprint(),
      pluginMessages.addNoTerminalFix(printable(id)),
    );
  }

  const entry = await findPlugin(service, id);
  if (entry.status === "broken") {
    throw brokenPluginError(entry.problems);
  }
  const { plugin } = entry;
  if (fingerprint !== undefined && fingerprint !== entry.fingerprint) {
    // Checked before "already on", as workspace `trust` does: a fingerprint
    // that isn't the current one is never a yes, whatever the state.
    throw fingerprintNotCurrent(entry);
  }
  // The manifest's name is outside text (cli-output 5).
  const name = printable(plugin.name);
  if (entry.status === "trusted") {
    return {
      exitCode: exitCode.ok,
      lines: [
        phrase`${markPart("done")} ${pluginMessages.alreadyOn(name, shownDate(entry.trustedAt)).phrase}`,
      ],
      json: {
        id: entry.folder,
        name: plugin.name,
        version: plugin.version,
        fingerprint: entry.fingerprint,
        status: "already-on",
      },
    };
  }
  return await askToTrustPlugin(
    service,
    entry,
    { context, yes, fingerprint },
    {
      on: pluginMessages.trustedOn(name),
      off: pluginMessages.stillOff(name),
      noTerminal: pluginMessages.offNoTerminal(name),
    },
  );
}

/**
 * The plugin whose folder is named `id`, exactly, case included, as the
 * plugins folder names it.
 *
 * @throws KindedError `not_found`, with the nearest id when one is close
 */
async function findPlugin(service: PluginService, id: string): Promise<PluginEntry> {
  const entries = await service.load();
  const found = entries.find((entry) => entry.folder === id);
  if (found !== undefined) {
    return found;
  }
  const shown = printable(id);
  const near = nearMatch(
    id,
    entries.map((entry) => entry.folder),
  );
  const problem =
    near === undefined
      ? pluginMessages.unknownPlugin(shown)
      : pluginMessages.unknownPluginNear(shown, printable(near));
  throw new KindedError("not_found", plainOf(problem), {
    fix: plainOf(pluginMessages.unknownPluginFix()),
  });
}

/**
 * `--remove`: forgets the trust, also when the plugin can't be read or
 * checked any more. Its settings and secrets stay; `plugin remove` deletes them.
 */
async function removeTrust(service: PluginService, entry: PluginEntry): Promise<CommandResult> {
  await service.revoke(entry.folder);
  const name = entry.status === "broken" ? entry.folder : entry.plugin.name;
  return {
    exitCode: exitCode.ok,
    lines: [phrase`${markPart("done")} ${pluginMessages.trustRemoved(printable(name)).phrase}`],
    json: { id: entry.folder, name, status: "removed" },
  };
}

function plainOf(message: Message): string {
  return plainText(message.phrase);
}

/** Whether an option was typed: a switch that is on, or any value. */
function isGiven(value: CommandInput["options"][string]): boolean {
  return value !== undefined && value !== false;
}
