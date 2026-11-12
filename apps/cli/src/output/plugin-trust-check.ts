// Turns a plugin's trust content into the lines `halonic plugin add` shows
// before it asks (cli-output 3.6): the same sections, headings and order as
// Studio's trust check (microcopy 24 T6-T9, CHECK P8), taken from the shared
// `pluginTrustSections` (app.plugin-trust-sections): Tools for agents,
// Programs on this computer, Secrets, Addresses, then the last line. Studio's
// "In Studio" section is left out: 0.1 has no Studio to draw the plugin's
// settings, commands, cards or panel, and that part carries no code
// (HAL-6417). Every word comes from the catalogue; this file only decides
// which sentence goes where.

import {
  type PluginTrustContent,
  type PluginTrustSection,
  pluginTrustSections,
} from "@halonicjs/app";
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
 * //  "  Reads         get_forecast", …, "", "Plugin code runs apart from the rest of Halonic. …"]
 */
export function pluginTrustCheckLines(content: PluginTrustContent): Phrase[] {
  return [
    pluginMessages.trustQuestion(printable(content.plugin.name)).phrase,
    ...pluginTrustSections(content).flatMap((name) => sectionLines(content, name)),
    phrase``,
    pluginMessages.notChecked().phrase,
  ];
}

/** Each section the CLI shows, with its heading from the catalogue and its rows. */
const cliSections: Readonly<
  Record<
    Exclude<PluginTrustSection, "in-studio">,
    {
      readonly heading: () => Message;
      readonly rows: (content: PluginTrustContent) => Phrase[];
    }
  >
> = {
  tools: { heading: pluginMessages.toolsHeading, rows: toolRows },
  programs: { heading: pluginMessages.programsHeading, rows: programRows },
  secrets: { heading: pluginMessages.secretsHeading, rows: secretRows },
  addresses: { heading: pluginMessages.addressesHeading, rows: addressRows },
};

/**
 * The CLI's heading for each section it shows, for the parity check with
 * Studio's (app.plugin-trust-sections).
 */
export const pluginTrustCheckHeadings = (): Partial<Record<PluginTrustSection, string>> =>
  Object.fromEntries(
    Object.entries(cliSections).map(([name, { heading }]) => [name, plainText(heading().phrase)]),
  );

/** A section with its heading after an empty line; "In Studio" has nothing to show here. */
function sectionLines(content: PluginTrustContent, name: PluginTrustSection): Phrase[] {
  if (name === "in-studio") return [];
  const { heading, rows } = cliSections[name];
  return [phrase``, heading().phrase, ...rows(content)];
}

/** Tools grouped by what they do; a tool that changes or sends something asks a person first. */
function toolRows(content: PluginTrustContent): Phrase[] {
  return riskGroups.flatMap(({ risk, heading }) => {
    const names = content.tools
      .filter((tool) => tool.risk === risk)
      .map((tool) =>
        risk === "read"
          ? phrase`${printable(tool.name)}`
          : phrase`${printable(tool.name)} ${markPart("separator")} ${pluginMessages.asksFirst().phrase}`,
      );
    return names.map((name, index) => row(index === 0 ? plainHeading(heading()) : "", name));
  });
}

function programRows(content: PluginTrustContent): Phrase[] {
  return content.localTools.map((tool) => {
    const command = [...startWords(tool.start), ...tool.args].join(" ");
    return row(printable(tool.id), phrase`${printable(command)}`);
  });
}

/** What starts the program: `npx @acme/tool 1.2.0` for a package, `node tools/run.js` for a script. */
function startWords(start: Record<string, unknown>): string[] {
  const { runner, name, version, program, path } = start;
  const words = typeof runner === "string" ? [runner, name, version] : [program, path];
  return words.filter((word): word is string => typeof word === "string");
}

/** Each secret with the one address it goes to. */
function secretRows(content: PluginTrustContent): Phrase[] {
  return content.secrets.map((secret) =>
    row(
      printable(secret.name),
      pluginMessages.secretGoesTo(secret.hosts.map(shownHost).join(", ")).phrase,
    ),
  );
}

/** Every address the plugin may reach, once each, in the order the content lists them. */
function addressRows(content: PluginTrustContent): Phrase[] {
  const hosts = new Set(content.hosts.map((entry) => shownHost(entry.host)));
  return [...hosts].map((host) => phrase`  ${host}`);
}

/** A host as written, or the setting that holds it. */
function shownHost(host: unknown): string {
  if (typeof host === "string") return printable(host);
  const setting = (host as { fromSetting?: unknown } | null)?.fromSetting;
  const words = pluginMessages.hostFromSetting(typeof setting === "string" ? setting : "");
  return plainText(words.phrase);
}

/** A catalogue sentence as plain text, for the first column of a row. */
function plainHeading(message: Message): string {
  return plainText(message.phrase);
}
