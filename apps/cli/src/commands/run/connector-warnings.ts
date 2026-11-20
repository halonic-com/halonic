// The warning `halonic run` gives for a connector whose tools a step
// couldn't list (HAL-13670): the engine logs `connector.listing-failed`
// and goes on, so without it a run would end ✓ with no word on why the
// agent had none of the connector's tools.

import type { RunEvent } from "@halonicjs/events";
import type { CommandContext } from "../../command.ts";
import { connectorStartMessages } from "../../messages/connector-start.ts";
import type { Message } from "../../messages/define.ts";
import { phrase } from "../../messages/phrase.ts";
import { printable } from "../../output/printable.ts";

type ListingFailed = Extract<RunEvent, { type: "connector.listing-failed" }>;

/**
 * Warns once for each connector a run's log says couldn't list its tools:
 * what happened, then the cause and its fix, indented under it. Every step
 * lists the tools again, and every follow reads the log from its first
 * event, so a connector is warned about only the first time.
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
  const { why, name } = event.cause;
  if (name !== undefined && why === "program-missing") {
    const program = printable(name);
    return [
      connectorStartMessages.notStarted(connector),
      indented(connectorStartMessages.programMissing(program)),
      indented(connectorStartMessages.programMissingFix(program, connector, file)),
    ];
  }
  if (name !== undefined && why === "secret-not-set") {
    const secret = printable(name);
    return [
      connectorStartMessages.notStarted(connector),
      indented(connectorStartMessages.secretMissing(secret)),
      indented(connectorStartMessages.secretMissingFix(secret)),
    ];
  }
  return [
    connectorStartMessages.notListed(connector),
    indented(connectorStartMessages.notListedFix(event.connector, dir)),
  ];
}

/** `message` two spaces in, as a fix line stands under its line 1. */
function indented(message: Message): Message {
  return { key: message.key, phrase: phrase`  ${message.phrase}` };
}
