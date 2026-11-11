// Turns a plugin's trust content into the lines `halonic plugin add` shows
// before it asks (cli-output 3.6): the same sections, headings and order as
// Studio's trust check (microcopy 24 T6-T9, CHECK P8): Tools for agents,
// Programs on this computer, Secrets, Addresses, In Studio, then the last
// line. A section shows only when it has something in it. Every word comes
// from the catalogue; this file only decides which sentence goes where.

import type { PluginTrustContent } from "@halonicjs/app";
import type { Message } from "../messages/define.ts";
import { markPart, type Phrase, phrase, plainText } from "../messages/phrase.ts";
import { pluginMessages } from "../messages/plugin.ts";
import { printable } from "./printable.ts";
import { row } from "./trust-check-rows.ts";

/** The tool risks in the order the check lists them, each with its group's heading. */
const riskGroups: readonly { readonly risk: string; readonly heading: () => Message }[] = [
  { risk: "read", heading: pluginMessages.reads },
  { risk: "write", heading: pluginMessages.changesThings },
  { risk: "send", heading: pluginMessages.sends },
];

/**
 * The check's lines for a plugin that isn't trusted yet: the question, the
 * sections that have rows, then what Halonic doesn't check. The question
 * itself, with `[y/N]`, is asked after these lines.
 *
 * @example
 * pluginTrustCheckLines(entry.content);
 * // ["Trust Weather and turn it on?", "", "Tools for agents",
 * //  "  Reads         get_forecast", …, "", "Plugin code runs apart from Studio. …"]
 */
export function pluginTrustCheckLines(content: PluginTrustContent): Phrase[] {
  return [
    pluginMessages.trustQuestion(content.plugin.name).phrase,
    ...toolsSection(content),
    ...programsSection(content),
    ...secretsSection(content),
    ...addressesSection(content),
    ...inStudioSection(content),
    phrase``,
    pluginMessages.notChecked().phrase,
  ];
}

/** A section with its heading after an empty line, or nothing when it has no rows. */
function section(heading: Message, rows: readonly Phrase[]): Phrase[] {
  return rows.length === 0 ? [] : [phrase``, heading.phrase, ...rows];
}

/** Tools grouped by what they do; a tool that changes or sends something asks a person first. */
function toolsSection(content: PluginTrustContent): Phrase[] {
  const rows = riskGroups.flatMap(({ risk, heading }) => {
    const names = content.tools
      .filter((tool) => tool.risk === risk)
      .map((tool) =>
        risk === "read"
          ? phrase`${printable(tool.name)}`
          : phrase`${printable(tool.name)} ${markPart("separator")} ${pluginMessages.asksFirst().phrase}`,
      );
    return names.map((name, index) => row(index === 0 ? plainHeading(heading()) : "", name));
  });
  return section(pluginMessages.toolsHeading(), rows);
}

function programsSection(content: PluginTrustContent): Phrase[] {
  const rows = content.localTools.map((tool) => {
    const command = [...startWords(tool.start), ...tool.args].join(" ");
    return row(printable(tool.id), phrase`${printable(command)}`);
  });
  return section(pluginMessages.programsHeading(), rows);
}

/** What starts the program: `npx @acme/tool 1.2.0` for a package, `node tools/run.js` for a script. */
function startWords(start: Record<string, unknown>): string[] {
  const { runner, name, version, program, path } = start;
  const words = typeof runner === "string" ? [runner, name, version] : [program, path];
  return words.filter((word): word is string => typeof word === "string");
}

/** Each secret with the one address it goes to. */
function secretsSection(content: PluginTrustContent): Phrase[] {
  const rows = content.secrets.map((secret) =>
    row(
      printable(secret.name),
      pluginMessages.secretGoesTo(secret.hosts.map(shownHost).join(", ")).phrase,
    ),
  );
  return section(pluginMessages.secretsHeading(), rows);
}

/** Every address the plugin may reach, once each, in the order the content lists them. */
function addressesSection(content: PluginTrustContent): Phrase[] {
  const hosts = new Set(content.hosts.map((entry) => shownHost(entry.host)));
  const rows = [...hosts].map((host) => phrase`  ${host}`);
  return section(pluginMessages.addressesHeading(), rows);
}

/** A host as written, or the setting that holds it. */
function shownHost(host: unknown): string {
  if (typeof host === "string") return printable(host);
  const setting = (host as { fromSetting?: unknown } | null)?.fromSetting;
  const words = pluginMessages.hostFromSetting(typeof setting === "string" ? setting : "");
  return plainText(words.phrase);
}

/** What Halonic draws for the plugin: its settings, commands, cards and panel. */
function inStudioSection(content: PluginTrustContent): Phrase[] {
  const ui = content.manifest.ui;
  if (ui === undefined) return [];
  const names = (items: readonly { readonly id: string }[]) =>
    items.map((item) => printable(item.id)).join(", ");
  const rows: [Message, string][] = [
    [pluginMessages.studioSettings(), Object.keys(ui.settings).map(printable).join(", ")],
    [pluginMessages.studioCommands(), names(ui.commands)],
    [pluginMessages.studioCards(), names(ui.cards)],
    [pluginMessages.studioPanel(), ui.panel === undefined ? "" : printable(ui.panel.title)],
  ];
  const shown = rows
    .filter(([, detail]) => detail !== "")
    .map(([label, detail]) => row(plainHeading(label), phrase`${detail}`));
  return section(pluginMessages.inStudioHeading(), shown);
}

/** A catalogue sentence as plain text, for the first column of a row. */
function plainHeading(message: Message): string {
  return plainText(message.phrase);
}
