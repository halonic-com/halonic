// The lines for a trusted plugin that is off on this computer (R13, check
// C540 #2, HAL-15080): its code doesn't run in the sandbox here, and the
// command never runs it without (`cli.no-unfenced-run-yes`), so its backend
// doesn't start. `plugin add`, `trust --plugin` and `plugin list` say it the
// same way, as Studio's plugin page does.

import { type RunnerUnfencedReason, runnerUnfencedWords } from "@halonicjs/app";
import type { Message } from "../messages/define.ts";
import { markPart, type Phrase, phrase } from "../messages/phrase.ts";
import { pluginMessages } from "../messages/plugin.ts";
import { rowIndent } from "./trust-check-rows.ts";

/**
 * The reason and its fix, then where the yes can be given, each indented
 * under the line that names the plugin.
 *
 * @example
 * offHereReasonLines("container");
 * // ["  Plugin code can't run in the sandbox inside a container. …", "  Allow it in the Halonic desktop app. …"]
 */
export function offHereReasonLines(reason: RunnerUnfencedReason): Phrase[] {
  const words = runnerUnfencedWords(reason, "plugin");
  return [
    phrase`${rowIndent}${words.reason} ${words.fix}`,
    phrase`${rowIndent}${pluginMessages.offHereAllow().phrase}`,
  ];
}

/** `first` with a !, then {@link offHereReasonLines}. */
export function offHereLines(first: Message, reason: RunnerUnfencedReason): Phrase[] {
  return [phrase`${markPart("needsYou")} ${first.phrase}`, ...offHereReasonLines(reason)];
}
