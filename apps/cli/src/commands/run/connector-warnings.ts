// The warning `halonic run` gives for a connector whose tools a step
// couldn't list (HAL-13670): the engine logs `connector.listing-failed`
// and goes on, so without it a run would end ✓ with no word on why the
// agent had none of the connector's tools.

import type { RunEvent } from "@halonicjs/events";
import type { CommandContext } from "../../command.ts";
import { connectorStartMessages } from "../../messages/connector-start.ts";
import type { Message } from "../../messages/define.ts";
import { phrase } from "../../messages/phrase.ts";
import { pluginMessages } from "../../messages/plugin.ts";
import { printable } from "../../output/printable.ts";

type ListingFailed = Extract<RunEvent, { type: "connector.listing-failed" }>;

/**
 * Warns once for each connector a run's log says couldn't list its tools:
 * what happened, then the cause and its fix, indented under it: a missing
 * program or secret, or a plugin that isn't trusted yet or changed since. Every step
 * lists the tools again, and every follow reads the log from its first
 * event, so a connector is warned about only the first time. A connector
 * whose parts the log already named as off (`connector.part-off`, written
 * before the listing's failure) gets no warning here: the run already
 * warned for each part, with why.
 *
 * @param dir - the user's own `--dir`, for the command it suggests
 * @param fileOf - the path of a connector's file in the workspace, or
 *   `undefined` when it has none, as for a connector from the hub
 * @example
 * const warnConnectors = connectorWarnings(context, typedDir, (id) => connectorFileOf(workspace, id));
 * // ! handbook-files didn't start, so its tools are off in this run.
 * //   The program npx-nope isn't on this computer.
 * //   Install npx-nope, or change the command in library/connectors/handbook-files.connector.yaml.
 */
export function connectorWarnings(
  context: Pick<CommandContext, "warn">,
  dir: string | undefined,
  fileOf: (connector: string) => string | undefined,
): (event: RunEvent) => void {
  const warned = new Set<string>();
  return (event) => {
    if (event.type === "connector.part-off") warned.add(event.connector);
    if (event.type !== "connector.listing-failed" || warned.has(event.connector)) return;
    warned.add(event.connector);
    for (const line of warningLines(event, dir, fileOf(event.connector))) {
      context.warn(line.phrase);
    }
  };
}

/** The warning's lines: the first unindented, the cause and fix under it. */
function warningLines(
  event: ListingFailed,
  dir: string | undefined,
  file: string | undefined,
): Message[] {
  const connector = printable(event.connector);
  const causeAndFix = causeLines(event.cause, connector, file);
  if (causeAndFix === undefined) {
    return [
      connectorStartMessages.notListed(connector),
      indented(connectorStartMessages.notListedFix(event.connector, dir)),
    ];
  }
  return [connectorStartMessages.notStarted(connector), ...causeAndFix.map(indented)];
}

/** The cause and its fix, or `undefined` when the log doesn't say why, so `tools review` has to. */
function causeLines(
  cause: ListingFailed["cause"],
  connector: string,
  file: string | undefined,
): Message[] | undefined {
  if (cause.name === undefined) return undefined;
  const name = printable(cause.name);
  switch (cause.why) {
    case "program-missing":
      return [
        connectorStartMessages.programMissing(name),
        connectorStartMessages.programMissingFix(name, connector, file),
      ];
    case "secret-not-set":
      return [
        connectorStartMessages.secretMissing(name),
        connectorStartMessages.secretMissingFix(name),
      ];
    case "plugin-not-trusted":
      return [
        connectorStartMessages.pluginNotTrusted(name),
        pluginMessages.startNotTrustedFix(name),
      ];
    case "plugin-changed":
      return [connectorStartMessages.pluginChanged(name), pluginMessages.startChangedFix(name)];
    case "other":
      return undefined;
  }
}

/** `message` two spaces in, as a fix line stands under its line 1. */
function indented(message: Message): Message {
  return { key: message.key, phrase: phrase`  ${message.phrase}` };
}
