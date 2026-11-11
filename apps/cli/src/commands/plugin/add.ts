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
import { NotTrustedError } from "../../not-trusted.ts";
import { pluginTrustCheckLines } from "../../output/plugin-trust-check.ts";
import { printable } from "../../output/printable.ts";
import { openPluginService, type PluginSetup } from "../../plugin-host.ts";

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
  return await askToTrust(service, entry, { context, yes, fingerprint });
}

/** What the answer to the trust question depends on. */
interface TrustAnswer {
  readonly context: CommandContext;
  /** `--yes`, which counts only with a `--fingerprint`. */
  readonly yes: boolean;
  readonly fingerprint: string | undefined;
}

async function askToTrust(
  service: PluginService,
  entry: AddedPlugin,
  answer: TrustAnswer,
): Promise<CommandResult> {
  const { plugin, fingerprint } = entry;
  const id = entry.folder;
  const json = { id, name: plugin.name, version: plugin.version, fingerprint };
  if (entry.status === "trusted") {
    return { exitCode: exitCode.ok, lines: [addedLine(plugin)], json: { ...json, status: "on" } };
  }
  const check = pluginTrustCheckLines(entry.content);
  const stoppedOff = (
    problem: ReturnType<typeof pluginMessages.addNoTerminal>,
    fix: typeof problem,
  ) => new NotTrustedError({ problem, fix, fingerprint, check, action: null, mark: "needsYou" });
  const noTerminal = () =>
    stoppedOff(pluginMessages.addNoTerminal(plugin.name), pluginMessages.addNoTerminalFix(id));
  if (answer.fingerprint !== undefined && answer.fingerprint !== fingerprint) {
    throw new NotTrustedError({
      problem: trustMessages.fingerprintChanged(),
      fix: pluginMessages.addNoTerminalFix(id),
      fingerprint,
      check,
      action: trustMessages.action(plugin.name),
    });
  }

  const trusted = await answer.context.ask({
    question: pluginMessages.trustQuestion(plugin.name),
    shownFirst: [...check, phrase``],
    yes: answer.yes,
    refusal: noTerminal,
  });
  if (!trusted) {
    return {
      exitCode: exitCode.notTrusted,
      lines: [
        phrase`${markPart("needsYou")} ${pluginMessages.addedButOff(plugin.name, id).phrase}`,
      ],
      json: { ...json, status: "off" },
    };
  }
  const granted = await service.trust(id, fingerprint, "cli");
  if (!granted.ok) {
    // The files changed between the check and the answer.
    throw new NotTrustedError({
      problem: trustMessages.fingerprintChanged(),
      fix: pluginMessages.addNoTerminalFix(id),
      fingerprint,
      check: [],
      action: trustMessages.action(plugin.name),
    });
  }
  return { exitCode: exitCode.ok, lines: [addedLine(plugin)], json: { ...json, status: "on" } };
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
