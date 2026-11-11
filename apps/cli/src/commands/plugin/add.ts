// `halonic plugin add <folder>`: copies a plugin into the profile's plugins
// folder, shows the trust check and asks whether to trust it (cli-output
// 3.6). A thin command over `PluginService.add` and `trust`: the service
// reads, checks and places the plugin, this file shows and asks.

import { stat } from "node:fs/promises";
import { resolve } from "node:path";
import { FileSystemFolderReader } from "@halonicjs/adapter-fs-node";
import type { PluginAddRefusal, PluginEntry, PluginProblem, PluginService } from "@halonicjs/app";
import { KindedError } from "@halonicjs/std";
import {
  type CommandContext,
  type CommandInput,
  type CommandResult,
  UsageError,
} from "../../command.ts";
import { exitCode } from "../../exit-code.ts";
import type { Message } from "../../messages/define.ts";
import { markPart, type Phrase, phrase, plainText } from "../../messages/phrase.ts";
import { pluginMessages } from "../../messages/plugin.ts";
import { trustMessages } from "../../messages/trust.ts";
import { printable } from "../../output/printable.ts";
import { openPluginService, type PluginSetup } from "../../plugin-host.ts";
import { askToTrustPlugin, type PluginTrustAnswer } from "../../plugin-trust-question.ts";

/** An added plugin that was read and checked. */
type AddedPlugin = Exclude<PluginEntry, { status: "broken" }>;

/**
 * Adds the plugin in a folder and asks whether to trust it. The plugin is
 * added in every case; answering No, or having no terminal, leaves it off
 * and ends with exit code 3, as Studio's Not now does (D4).
 *
 * @throws UsageError for `--yes` without `--fingerprint`, before anything is copied
 * @throws KindedError when the folder can't be read or checked, or the plugin is already added
 * @throws NotTrustedError when the plugin was added but is off, because nobody
 *   could answer or the `--fingerprint` isn't the one of what was added
 */
export async function addPlugin(
  input: CommandInput,
  context: CommandContext,
  setup: PluginSetup,
): Promise<CommandResult> {
  const source = input.positionals[0];
  if (source === undefined) {
    throw new UsageError(pluginMessages.addNeedsSource(), pluginMessages.addUsage());
  }
  const given = input.options["fingerprint"];
  const fingerprint = typeof given === "string" ? given : undefined;
  const yes = input.options["yes"] === true;
  if (yes && fingerprint === undefined) {
    throw new UsageError(
      trustMessages.yesNeedsFingerprint(),
      pluginMessages.yesNeedsFingerprintFix(),
    );
  }

  const folder = resolve(context.cwd, source);
  if (!(await isFolder(folder))) {
    throw refusal("invalid_input", pluginMessages.notAFolder(printable(source)).phrase);
  }
  const service = openPluginService(setup);
  const added = await service.add(new FileSystemFolderReader(folder), {
    from: { kind: "folder", path: folder },
    replace: false,
  });
  if (!added.ok) throw refused(added.error);
  const entry = added.value;
  if (entry.status === "broken") {
    throw refusal("invalid_input", firstProblem(entry.problems));
  }
  return await trustAdded(service, entry, { context, yes, fingerprint });
}

/** Says it's on, or asks whether to trust it, with `plugin add`'s words around the question. */
async function trustAdded(
  service: PluginService,
  entry: AddedPlugin,
  answer: PluginTrustAnswer,
): Promise<CommandResult> {
  const { plugin } = entry;
  if (entry.status === "trusted") {
    const json = { id: entry.folder, name: plugin.name, version: plugin.version };
    return {
      exitCode: exitCode.ok,
      lines: [addedLine(plugin)],
      json: { ...json, fingerprint: entry.fingerprint, status: "on" },
    };
  }
  return await askToTrustPlugin(service, entry, answer, {
    on: pluginMessages.added(plugin.name, plugin.version),
    off: pluginMessages.addedButOff(plugin.name, entry.folder),
    noTerminal: pluginMessages.addNoTerminal(plugin.name),
  });
}

function addedLine(plugin: AddedPlugin["plugin"]) {
  return phrase`${markPart("done")} ${pluginMessages.added(plugin.name, plugin.version).phrase}`;
}

/** The refusal for a plugin that wasn't added, with its reason and "Check the folder or git address.". */
function refused(error: PluginAddRefusal): KindedError {
  if (error.kind === "taken") {
    return new KindedError("conflict", plainOf(pluginMessages.alreadyAdded(error.id)), {
      fix: plainOf(pluginMessages.alreadyAddedFix(error.id)),
    });
  }
  return refusal("invalid_input", firstProblem(error.problems));
}

/** The first problem's own words, which are the reason; never more detail than that. */
function firstProblem(problems: readonly PluginProblem[]): Phrase {
  return phrase`${printable(problems[0]?.message ?? "")}`;
}

/** "Couldn't add the plugin: <reason> · Check the folder or git address." */
function refusal(kind: "invalid_input", reason: Phrase): KindedError {
  return new KindedError(kind, plainText(reason), {
    fix: plainOf(pluginMessages.refusedSourceFix()),
  });
}

function plainOf(message: Message): string {
  return plainText(message.phrase);
}

/** Whether `path` is a folder, or a link to one. */
async function isFolder(path: string): Promise<boolean> {
  const found = await stat(path).catch(() => null);
  return found?.isDirectory() === true;
}
