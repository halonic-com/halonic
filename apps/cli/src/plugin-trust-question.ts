// The one way the CLI asks a person to trust a plugin that is off, shared by
// `halonic plugin add` (after the copy) and `halonic trust --plugin <id>`
// (cli-output 3.6). Both show Studio's trust check, take `--yes` only with
// the `--fingerprint` of what was checked, and leave the plugin off with
// exit 3 on No, without a terminal, or for a fingerprint that isn't current.
// Only the lines around the question differ, so each command passes its own.

import type { PluginEntry, PluginProblem, PluginService } from "@halonicjs/app";
import { KindedError } from "@halonicjs/std";
import type { CommandContext, CommandResult } from "./command.ts";
import { exitCode } from "./exit-code.ts";
import type { Message } from "./messages/define.ts";
import { markPart, type Phrase, phrase, plainText } from "./messages/phrase.ts";
import { pluginMessages } from "./messages/plugin.ts";
import { trustMessages } from "./messages/trust.ts";
import { NotTrustedError } from "./not-trusted.ts";
import { pluginTrustCheckLines } from "./output/plugin-trust-check.ts";
import { printable } from "./output/printable.ts";

/** A plugin that was read and checked, and isn't trusted as it is now. */
export type PluginToTrust = Exclude<PluginEntry, { status: "broken" | "trusted" }>;

/** What the answer to the trust question depends on. */
export interface PluginTrustAnswer {
  readonly context: CommandContext;
  /** `--yes`, which counts only with a `--fingerprint`. */
  readonly yes: boolean;
  readonly fingerprint: string | undefined;
}

/** The lines a command says around the question, for the plugin it asks about. */
export interface PluginTrustWords {
  /** With a ✓, once it is trusted. */
  readonly on: Message;
  /** With a !, after No or Enter. */
  readonly off: Message;
  /** Line 1 of the refusal when there's no terminal to ask. */
  readonly noTerminal: Message;
}

/**
 * Shows the plugin's trust check, asks "Trust <name> and turn it on?" and
 * trusts exactly the fingerprint that was checked. A `--fingerprint` that
 * isn't the current one asks nothing and saves nothing.
 *
 * @throws NotTrustedError when nobody can answer and `--yes --fingerprint`
 *   weren't given, or when the fingerprint given or answered isn't current
 * @throws KindedError when the files changed during the question into a
 *   plugin that can't be read or checked
 *
 * @example
 * await askToTrustPlugin(service, entry, { context, yes: false, fingerprint: undefined }, words);
 * // { exitCode: 0, lines: ["✓ Weather is on now."], json: { …, status: "on" } }
 */
export async function askToTrustPlugin(
  service: PluginService,
  entry: PluginToTrust,
  answer: PluginTrustAnswer,
  words: PluginTrustWords,
): Promise<CommandResult> {
  const { plugin, fingerprint } = entry;
  const id = entry.folder;
  const json = { id, name: plugin.name, version: plugin.version, fingerprint };
  // The manifest's name is outside text (cli-output 5).
  const name = printable(plugin.name);
  const check = pluginTrustCheckLines(entry.content);
  const fix = pluginMessages.addNoTerminalFix(id);
  if (answer.fingerprint !== undefined && answer.fingerprint !== fingerprint) {
    throw fingerprintNotCurrent(entry);
  }

  const trusted = await answer.context.ask({
    question: pluginMessages.trustQuestion(name),
    shownFirst: [...check, phrase``],
    yes: answer.yes,
    refusal: () =>
      new NotTrustedError({
        problem: words.noTerminal,
        fix,
        fingerprint,
        check,
        action: null,
        mark: "needsYou",
      }),
  });
  if (!trusted) {
    return {
      exitCode: exitCode.notTrusted,
      lines: [phrase`${markPart("needsYou")} ${words.off.phrase}`],
      json: { ...json, status: "off" },
    };
  }
  const granted = await service.trust(id, fingerprint, "cli");
  if (!granted.ok) {
    // The files changed between the check and the answer: into another
    // plugin, or into one that can't be read or checked any more.
    if (granted.error.kind === "broken") {
      throw brokenPluginError(granted.error.problems);
    }
    throw fingerprintNotCurrent(entry, { check: [], fingerprint: granted.error.fingerprint });
  }
  return {
    exitCode: exitCode.ok,
    lines: [phrase`${markPart("done")} ${words.on.phrase}`],
    json: { ...json, status: "on" },
  };
}

/** A plugin that was read and checked, trusted or not. */
type CheckedPlugin = Exclude<PluginEntry, { status: "broken" }>;

/**
 * "✕ Couldn't trust Weather: it changed since that fingerprint was made.",
 * leaving the plugin as it is (exit 3). The refusal ends with the fingerprint
 * the plugin has now, as a check run now would, so a script can pass it to
 * `--yes --fingerprint` after a review.
 *
 * @param now - what changed during the question: no check to show again and
 *   the fingerprint the files have now; by default, the entry's own
 */
export function fingerprintNotCurrent(
  entry: CheckedPlugin,
  now: { readonly check: readonly Phrase[]; readonly fingerprint: string } = {
    check: pluginTrustCheckLines(entry.content),
    fingerprint: entry.fingerprint,
  },
): NotTrustedError {
  return new NotTrustedError({
    problem: trustMessages.fingerprintChanged(),
    fix: pluginMessages.addNoTerminalFix(entry.folder),
    fingerprint: now.fingerprint,
    check: now.check,
    // The manifest's name is outside text (cli-output 5).
    action: trustMessages.action(printable(entry.plugin.name)),
  });
}

/**
 * The refusal to trust a plugin that can't be read or checked: its first
 * problem's own words, and how to see the plugins (exit 2).
 */
export function brokenPluginError(problems: readonly PluginProblem[]): KindedError {
  return new KindedError("invalid_input", printable(problems[0]?.message ?? ""), {
    fix: plainText(pluginMessages.unknownPluginFix().phrase),
  });
}
