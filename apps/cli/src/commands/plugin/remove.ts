// `halonic plugin remove <id>`: removes a plugin from the profile's plugins
// folder with its trust, settings and secrets, after asking (cli-output
// 3.6). A thin command over `PluginService.remove`: the service removes
// everything in the order that lets a second run finish the job, this file
// finds the plugin and asks.

import type { PluginEntry, PluginRemoveRefusal, PluginService } from "@halonicjs/app";
import { KindedError } from "@halonicjs/std";
import {
  type CommandContext,
  type CommandInput,
  type CommandResult,
  OwnLineError,
  UsageError,
} from "../../command.ts";
import { exitCode } from "../../exit-code.ts";
import { markPart, phrase, plainText } from "../../messages/phrase.ts";
import { pluginMessages } from "../../messages/plugin.ts";
import { nearMatch } from "../../near-match.ts";
import { printable } from "../../output/printable.ts";
import { deletePluginSecret, openPluginService, type PluginSetup } from "../../plugin-host.ts";

/**
 * What the question and the ✓ line say about the plugin being removed. Its
 * name and version are outside text, so they are made printable once here
 * (cli-output 5) and every line can print them as they are.
 */
interface RemovedPlugin {
  readonly id: string;
  /** Its manifest's name, or its folder's name when it can't be read, made printable. */
  readonly name: string;
  /** Its manifest's version made printable, or `undefined` when it can't be read. */
  readonly version: string | undefined;
  /** Whether any secret is kept for it, so the question names the API key. */
  readonly hasSecrets: boolean;
}

/**
 * Removes the plugin `id` after asking, or straight away with `--yes`. A
 * plugin that can't be read or checked is removed the same way, by its
 * folder's name. Answering No, or Enter, removes nothing and exits 1.
 *
 * @throws UsageError without an id, or when there's no terminal to ask and no `--yes`
 * @throws OwnLineError (`not_found`) when no plugin has exactly that id
 * @throws KindedError when one of its secrets couldn't be deleted; running it again finishes the job
 */
export async function removePlugin(
  input: CommandInput,
  context: CommandContext,
  setup: PluginSetup,
): Promise<CommandResult> {
  const id = input.positionals[0];
  if (id === undefined) {
    throw new UsageError(pluginMessages.removeNeedsId(), pluginMessages.removeUsage());
  }
  const service = openPluginService(setup);
  const entries = await service.load();
  const entry = entries.find((each) => each.folder === id);
  if (entry === undefined) throw unknownPlugin(id, entries);
  const plugin = await removedPlugin(service, entry);

  const sure = await context.ask({
    question: pluginMessages.removeQuestion(plugin.name, plugin.hasSecrets),
    yes: input.options["yes"] === true,
    refusal: () =>
      new UsageError(
        pluginMessages.removeNoTerminal(plugin.name),
        pluginMessages.removeNoTerminalFix(),
      ),
  });
  if (!sure) {
    return {
      exitCode: exitCode.failed,
      lines: [pluginMessages.notRemoved(plugin.name).phrase],
      json: { id, removed: false },
    };
  }

  const removed = await service.remove(id, deletePluginSecret);
  if (!removed.ok) throw secretNotDeleted(removed.error);
  return {
    exitCode: exitCode.ok,
    lines: [phrase`${markPart("done")} ${removedLine(plugin)}`],
    json: { id, removed: true },
  };
}

async function removedPlugin(service: PluginService, entry: PluginEntry): Promise<RemovedPlugin> {
  const id = entry.folder;
  if (entry.status !== "broken") {
    const { plugin } = entry;
    const hasSecrets = Object.keys(service.secretNames(plugin)).length > 0;
    return { id, name: printable(plugin.name), version: printable(plugin.version), hasSecrets };
  }
  // A plugin that can't be read still has the secret names it was added with.
  const install = await service.install(id);
  const hasSecrets = Object.keys(install?.secretNames ?? {}).length > 0;
  return { id, name: printable(id), version: undefined, hasSecrets };
}

function removedLine(plugin: RemovedPlugin) {
  return plugin.version === undefined
    ? pluginMessages.removedUnread(plugin.name).phrase
    : pluginMessages.removed(plugin.name, plugin.version).phrase;
}

/** "There's no plugin called "wether". Did you mean weather? · See them with halonic plugin list." */
function unknownPlugin(id: string, entries: readonly PluginEntry[]): OwnLineError {
  const shown = printable(id);
  const near = nearMatch(
    id,
    entries.map((entry) => entry.folder),
  );
  return new OwnLineError(
    "not_found",
    near === undefined
      ? pluginMessages.unknownPlugin(shown)
      : pluginMessages.unknownPluginNear(shown, printable(near)),
    pluginMessages.unknownPluginFix(),
  );
}

/** The secret by its declared name, never its value, and how to finish the job. */
function secretNotDeleted(refusal: PluginRemoveRefusal): KindedError {
  return new KindedError(
    "unavailable",
    plainText(
      pluginMessages.secretNotDeleted(printable(refusal.secret), printable(refusal.reason)).phrase,
    ),
    { fix: plainText(pluginMessages.secretNotDeletedFix().phrase) },
  );
}
