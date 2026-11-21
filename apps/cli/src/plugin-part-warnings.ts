// The warning `halonic run` gives for a part of a plugin that can't start
// (HAL-12343): the plugin's other parts keep working, so without it a run
// would end with no word on why the agent had none of that part's tools.

import type { PluginPartUnavailable, PluginPartUnavailableReason } from "@halonicjs/app";
import { errorMessages } from "./messages/general.ts";
import { markPart, type Phrase, phrase } from "./messages/phrase.ts";
import { type PluginPartShown, runMessages } from "./messages/run.ts";
import { sandboxDocsLink, sandboxMessages } from "./messages/sandbox.ts";
import { printable } from "./output/printable.ts";

/** Where the run's connectors tell the person about a plugin part that can't start, and log a failed clean-up. */
export interface RunConnectorLines {
  warn(line: Phrase): void;
  debug(line: Phrase): void;
}

/**
 * The plugin connectors' `onUnavailable`: a warning naming the part of a
 * plugin whose tools are off, shown with or without `--debug`, so a run
 * never leaves them out silently. Line 1 has the shape of the other
 * connector warnings, and the reason follows on the lines under it
 * (C484-1, HAL-12343). Each is written once for each connector, part and
 * reason, a reason's details included.
 *
 * @param wslDistro - the WSL distro the CLI runs in, for the WSL 1 fix's command
 * @example
 * const onUnavailable = pluginPartReporter(lines, process.env["WSL_DISTRO_NAME"]);
 * // ! The program lister of the plugin files didn't start, so its tools are off in this run.
 * //   bubblewrap isn't installed. Install it, for example on Ubuntu or Debian with sudo apt install bubblewrap, then run it again.
 * //   More: https://docs.halonic.dev/security/sandbox/#bubblewrap (bubblewrap-missing)
 */
export function pluginPartReporter(
  lines: RunConnectorLines,
  wslDistro?: string,
): (connector: string, unavailable: PluginPartUnavailable) => void {
  const told = new Set<string>();
  return (connector, { plugin, part, reason, error }) => {
    const key = JSON.stringify([connector, part, reason]);
    if (told.has(key)) return;
    told.add(key);
    const shown: PluginPartShown =
      part === "backend"
        ? { kind: "backend" }
        : { kind: "program", name: printable(part.slice("local:".length)) };
    lines.warn(
      phrase`${markPart("needsYou")} ${runMessages.pluginPartOff(printable(plugin), shown).phrase}`,
    );
    for (const line of pluginPartWhy(reason, error, wslDistro)) {
      lines.warn(phrase`  ${line}`);
    }
    if (reason.kind === "sandbox-not-fenced") {
      lines.debug(runMessages.pluginPartFence(reason.fence).phrase);
    }
  };
}

/**
 * The lines under a plugin part's warning: why it didn't start, and the fix
 * where there is one. A sandbox that can't start reads as `run`'s refusal
 * does for its code (cli-output 3.8), with the dimmed docs line and the code
 * last, and `other`'s words for a code this version doesn't know.
 */
function pluginPartWhy(
  reason: PluginPartUnavailableReason,
  error: unknown,
  wslDistro: string | undefined,
): Phrase[] {
  switch (reason.kind) {
    case "sandbox-unavailable":
      return [
        sandboxMessages.refusedFix(reason.reason, { distro: wslDistro }).phrase,
        errorMessages.more(sandboxDocsLink(reason.reason), printable(reason.reason)).phrase,
      ];
    case "sandbox-not-fenced":
      return [runMessages.pluginPartNotConfirmed().phrase];
    case "network-needs-srt":
      return [runMessages.pluginPartNetwork().phrase];
    case "settings-not-set":
      return [runMessages.pluginPartSettings(reason.settings.map(printable)).phrase];
    case "not-trusted":
    case "failed":
      return [runMessages.pluginPartError(reasonOf(error)).phrase];
    case "needs-desktop-app":
      // Only a host with no sandbox at all gives this, and the CLI always has one.
      return [];
  }
}

/** A thrown value's message, safe to print on one line. */
function reasonOf(error: unknown): string {
  return printable(error instanceof Error ? error.message : String(error));
}
