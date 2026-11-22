// The warning `halonic run` gives for a connector whose tools a step
// couldn't list (HAL-13670): the engine logs `connector.listing-failed`
// and goes on, so without it a run would end ✓ with no word on why the
// agent had none of the connector's tools. A plugin connector's warning
// names the plugin's state on this computer (HAL-14296, C13+ on HAL-14271).

import { runnerUnfencedWords } from "@halonicjs/app";
import type { RunEvent } from "@halonicjs/events";
import type { CommandContext } from "../../command.ts";
import type { ConnectorPlugin } from "../../connector-plugin.ts";
import { connectorStartMessages } from "../../messages/connector-start.ts";
import type { Message } from "../../messages/define.ts";
import { phrase } from "../../messages/phrase.ts";
import { pluginMessages } from "../../messages/plugin.ts";
import { toolsMessages } from "../../messages/tools.ts";
import { printable } from "../../output/printable.ts";

type ListingFailed = Extract<RunEvent, { type: "connector.listing-failed" }>;

/** A plugin connector's plugin: its id and where it stands on this computer. */
export interface WarnedPlugin {
  readonly id: string;
  readonly state: ConnectorPlugin;
}

/** What the warning reads about a run's connectors in the workspace. */
export interface WarnedConnectors {
  /**
   * The path of the connector's file in the workspace, or `undefined` when
   * it has none, as for a connector from the hub.
   */
  fileOf(connector: string): string | undefined;
  /** Whether the connector is a local integration's, which starts in the integration runner. */
  isIntegration(connector: string): boolean;
  /**
   * For a plugin connector, its plugin as the profile has it now, or
   * `undefined` when it isn't a plugin's or that can't be read. Left out
   * where only the log counts, as in `runs show`.
   */
  pluginOf?(connector: string): WarnedPlugin | undefined;
  /**
   * Whether a yes given in Studio reaches this command, so the fix for a
   * local integration the gate refused can send the person there (C612).
   * Left out where only the log counts, as in `runs show`: then it does.
   */
  readonly studioYesReaches?: boolean;
}

/**
 * Warns once for each connector a run's log says couldn't list its tools:
 * what happened, then the cause and its fix, indented under it: a missing
 * program or secret, a program that stopped right after it started, a
 * plugin that isn't trusted yet or changed since, a plugin's sandbox that
 * can't start, a local integration the gate didn't let start without the
 * sandbox, or, read from the profile, a plugin that isn't added or can't be
 * read. Every step
 * lists the tools again, and every follow reads the log from its first
 * event, so a connector is warned about only the first time. A connector
 * whose parts the log already named as off (`connector.part-off`, written
 * before the listing's failure) gets no warning here: the run already
 * warned for each part, with why.
 *
 * When the log doesn't say why, the fix line points to `halonic tools
 * review`, which starts the connector and says why it couldn't list its
 * tools. An integration's connector has nothing for `tools review` to show
 * (HAL-14784), so its fix line points to `halonic doctor`, which checks the
 * sandbox and the workspace's trust its runner needs (HAL-15250).
 *
 * @param dir - the user's own `--dir`, for the command it suggests
 * @example
 * const warnConnectors = connectorWarnings(context, typedDir, {
 *   fileOf: (id) => connectorFileOf(workspace, id),
 *   isIntegration: (id) => isIntegrationConnector(workspace, id),
 * });
 * // ! handbook-files didn't start, so its tools are off in this run.
 * //   The program npx-nope isn't on this computer.
 * //   Install npx-nope, or change the command in library/connectors/handbook-files.connector.yaml.
 */
export function connectorWarnings(
  context: Pick<CommandContext, "warn">,
  dir: string | undefined,
  connectors: WarnedConnectors,
): (event: RunEvent) => void {
  const warned = new Set<string>();
  return (event) => {
    if (event.type === "connector.part-off") warned.add(event.connector);
    if (event.type !== "connector.listing-failed" || warned.has(event.connector)) return;
    warned.add(event.connector);
    for (const line of warningLines(event, dir, connectors)) {
      context.warn(line.phrase);
    }
  };
}

/** The warning's lines: the first unindented, the cause and fix under it. */
function warningLines(
  event: ListingFailed,
  dir: string | undefined,
  connectors: WarnedConnectors,
): Message[] {
  const connector = printable(event.connector);
  const causeAndFix = causeLines(event, connector, connectors);
  if (causeAndFix === undefined) {
    return [
      connectorStartMessages.notListed(connector),
      indented(unknownCauseFix(event, dir, connectors)),
    ];
  }
  return [connectorStartMessages.notStarted(connector), ...causeAndFix.map(indented)];
}

/** The command that shows more when the log doesn't say why: `tools review`, or `doctor` for an integration. */
function unknownCauseFix(
  event: ListingFailed,
  dir: string | undefined,
  connectors: WarnedConnectors,
): Message {
  return connectors.isIntegration(event.connector)
    ? connectorStartMessages.integrationNotListedFix(dir)
    : connectorStartMessages.notListedFix(event.connector, dir);
}

/**
 * The cause and its fix, or `undefined` when neither the log nor where the
 * connector's plugin stands says why.
 */
function causeLines(
  event: ListingFailed,
  connector: string,
  connectors: WarnedConnectors,
): Message[] | undefined {
  const { cause } = event;
  if (cause.why === "sandbox-not-ready") {
    return [connectorStartMessages.sandboxNotReady(), connectorStartMessages.sandboxNotReadyFix()];
  }
  if (cause.why === "other") return pluginStateLines(connectors.pluginOf?.(event.connector));
  if (cause.name === undefined) return undefined;
  const name = printable(cause.name);
  switch (cause.why) {
    case "program-missing":
      return [
        connectorStartMessages.programMissing(name),
        connectorStartMessages.programMissingFix(
          name,
          connector,
          connectors.fileOf(event.connector),
        ),
      ];
    case "program-stopped":
      return [
        connectorStartMessages.programStopped(name),
        connectorStartMessages.cantListProgramStoppedFix(
          connector,
          connectors.fileOf(event.connector),
        ),
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
    case "plugin-stopped":
      return [
        connectorStartMessages.pluginStopped(name),
        connectorStartMessages.pluginStoppedNext(name),
      ];
    case "unfenced-not-allowed":
      return [
        connectorStartMessages.unfencedNotAllowed(
          runnerUnfencedWords(cause.name, "integration").reason,
        ),
        connectorStartMessages.unfencedNotAllowedFix(connectors.studioYesReaches ?? true),
      ];
  }
}

/**
 * For a plugin connector the log has no cause for: that its plugin isn't
 * added (with the added plugin whose id is close) or can't be read, in
 * `tools review`'s words, read from the profile. `undefined` otherwise, so
 * the plain line stays: a plugin that isn't trusted or changed since has its
 * own cause in the log.
 */
function pluginStateLines(plugin: WarnedPlugin | undefined): Message[] | undefined {
  if (plugin === undefined) return undefined;
  const id = printable(plugin.id);
  const { state } = plugin;
  if (state.state === "broken") return [pluginMessages.pluginBroken(id)];
  if (state.state !== "not_added") return undefined;
  const notAdded = toolsMessages.pluginNotAdded(id);
  if (state.near === undefined) return [notAdded];
  return [notAdded, toolsMessages.didYouMean(printable(state.near))];
}

/** `message` two spaces in, as a fix line stands under its line 1. */
function indented(message: Message): Message {
  return { key: message.key, phrase: phrase`  ${message.phrase}` };
}
