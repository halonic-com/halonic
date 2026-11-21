// The lines for a trusted plugin that is off on this computer (R13, check
// C540 #2, HAL-15080): its code doesn't run in the sandbox here, and the
// command never runs it without (`cli.no-unfenced-run-yes`), so its backend
// doesn't start. `plugin add`, `trust --plugin` and `plugin list` say it the
// same way, as Studio's plugin page does, but with the CLI's own sandbox
// words: Studio's fixes can point to its Settings, which the CLI doesn't
// have (C566 #22, HAL-15361).

import type { RunnerUnfencedReason } from "@halonicjs/app";
import type { Message } from "../messages/define.ts";
import { markPart, type Phrase, phrase } from "../messages/phrase.ts";
import { pluginMessages } from "../messages/plugin.ts";
import { sandboxMessages } from "../messages/sandbox.ts";
import { rowIndent } from "./trust-check-rows.ts";

/**
 * The reason and its fix, then where the yes can be given, each indented
 * under the line that names the plugin. `name` is the plugin's printable
 * name, as Studio's Plugins list shows it.
 *
 * @example
 * offHereReasonLines("container", "Weather");
 * // ["  Plugin code can't run in the sandbox inside a container. …", "  Or allow this in the Halonic desktop app: Settings › Plugins › Weather › Review. …"]
 */
export function offHereReasonLines(reason: RunnerUnfencedReason, name: string): Phrase[] {
  return [
    phrase`${rowIndent}${sandboxMessages.reasonAndFix(reason).phrase}`,
    phrase`${rowIndent}${pluginMessages.offHereAllow(name).phrase}`,
  ];
}

/** `first` with a !, then {@link offHereReasonLines}. */
export function offHereLines(first: Message, reason: RunnerUnfencedReason, name: string): Phrase[] {
  return [phrase`${markPart("needsYou")} ${first.phrase}`, ...offHereReasonLines(reason, name)];
}
