// The one way the CLI asks a person to trust a plugin that is off, shared by
// `halonic plugin add` (after the copy) and `halonic trust --plugin <id>`
// (cli-output 3.6). Both show Studio's trust check, take `--yes` only with
// the `--fingerprint` of what was checked, and leave the plugin off with
// exit 3 on No, without a terminal, or for a fingerprint that isn't current.
// Only the lines around the question differ, so each command passes its own.

import type { PluginEntry, PluginService } from "@halonicjs/app";
import type { CommandContext, CommandResult } from "./command.ts";
import { exitCode } from "./exit-code.ts";
import type { Message } from "./messages/define.ts";
import { markPart, phrase } from "./messages/phrase.ts";
import { pluginMessages } from "./messages/plugin.ts";
import { trustMessages } from "./messages/trust.ts";
import { NotTrustedError } from "./not-trusted.ts";
import { pluginTrustCheckLines } from "./output/plugin-trust-check.ts";

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
  const check = pluginTrustCheckLines(entry.content);
  const fix = pluginMessages.addNoTerminalFix(id);
  const changed = (shownCheck: typeof check) =>
    new NotTrustedError({
      problem: trustMessages.fingerprintChanged(),
      fix,
      fingerprint,
      check: shownCheck,
      action: trustMessages.action(plugin.name),
    });
  if (answer.fingerprint !== undefined && answer.fingerprint !== fingerprint) {
    throw changed(check);
  }

  const trusted = await answer.context.ask({
    question: pluginMessages.trustQuestion(plugin.name),
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
    // The files changed between the check and the answer.
    throw changed([]);
  }
  return {
    exitCode: exitCode.ok,
    lines: [phrase`${markPart("done")} ${words.on.phrase}`],
    json: { ...json, status: "on" },
  };
}
