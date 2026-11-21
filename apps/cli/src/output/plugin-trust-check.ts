// Turns a plugin's trust content into the lines `halonic plugin add` shows
// before it asks (cli-output 3.6): the same sections, headings and order as
// Studio's trust check (microcopy 24 T6-T9, CHECK P8), taken from the shared
// `pluginTrustSections` (app.plugin-trust-sections): Tools for agents,
// Programs, Secrets, Sign-ins, Addresses, then the last line. Under each
// program, where it runs, in Studio's words (`pluginTrustRunsText`). Studio's
// "In Studio" section is left out: 0.1 has no Studio to draw the plugin's
// settings, commands, cards or panel, and that part carries no code
// (HAL-6417). Every word comes from the catalogue; this file only decides
// which sentence goes where.

import {
  declaredSignInTrustFacts,
  type LocalToolState,
  type PluginTrustContent,
  type PluginTrustSection,
  pluginProgramSecretText,
  pluginTrustFiles,
  pluginTrustSections,
  signInTokenHostDiffers,
  signInTokenHostWarning,
  signInTrustLine,
} from "@halonicjs/app";
import { withHomeAsTilde } from "@halonicjs/profile";
import type { Message } from "../messages/define.ts";
import { markPart, type Phrase, phrase, plainText } from "../messages/phrase.ts";
import { pluginMessages } from "../messages/plugin.ts";
import { trustMessages } from "../messages/trust.ts";
import { nodeProfileEnvironment } from "../workspace-runs.ts";
import { printable } from "./printable.ts";
import { row, rowIndent, underRow } from "./trust-check-rows.ts";

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
 * @param programsRun - whether the plugin's programs can run on this computer,
 *   as `PluginLocalTools.state()` says; without it, each program's Runs line
 *   says what holds either way
 *
 * @example
 * pluginTrustCheckLines(entry.content, entry.location);
 * // ["Trust Weather and turn it on?", "", "Tools for agents",
 * //  "  Agents can use these through a connector. …", "  Reads         get_forecast", …, "", "Plugin code runs apart from the rest of Halonic. …"]
 */
export function pluginTrustCheckLines(
  content: PluginTrustContent,
  folder: string,
  programsRun?: ProgramsRun,
): Phrase[] {
  return [
    pluginMessages.trustQuestion(printable(content.plugin.name)).phrase,
    ...pluginTrustSections(content).flatMap((name) => sectionLines(content, name, programsRun)),
    ...locationLines(content, folder),
    phrase``,
    pluginMessages.notChecked().phrase,
  ];
}

/**
 * The full fingerprint under the check in a terminal, as a workspace's check
 * ends (cli-output 3.5), so `--yes --fingerprint` can be given after a review.
 * Without a terminal it isn't added: the bare fingerprint is the last stdout line.
 *
 * @example
 * pluginFingerprintLines("hpf1:c9b6…");
 * // ["", "Fingerprint", "  hpf1:c9b6…", "  Covers the manifest and the files above."]
 */
export function pluginFingerprintLines(fingerprint: string): Phrase[] {
  return [
    phrase``,
    trustMessages.fingerprintHeading().phrase,
    phrase`${rowIndent}${fingerprint}`,
    phrase`${rowIndent}${pluginMessages.fingerprintCovers().phrase}`,
  ];
}

/** Whether a plugin's programs can run here, as `PluginLocalTools.state()` says, if known. */
export type ProgramsRun = LocalToolState["kind"] | undefined;

/** Each section the CLI shows, with its heading from the catalogue and its rows. */
const cliSections: Readonly<
  Record<
    Exclude<PluginTrustSection, "in-studio">,
    {
      readonly heading: () => Message;
      readonly rows: (content: PluginTrustContent, programsRun: ProgramsRun) => Phrase[];
    }
  >
> = {
  tools: { heading: pluginMessages.toolsHeading, rows: toolRows },
  programs: { heading: pluginMessages.programsHeading, rows: programRows },
  secrets: { heading: pluginMessages.secretsHeading, rows: secretRows },
  "sign-ins": { heading: pluginMessages.signInsHeading, rows: signInRows },
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
function sectionLines(
  content: PluginTrustContent,
  name: PluginTrustSection,
  programsRun: ProgramsRun,
): Phrase[] {
  if (name === "in-studio") return [];
  const { heading, rows } = cliSections[name];
  return [phrase``, heading().phrase, ...rows(content, programsRun)];
}

/**
 * Where the plugin sits on disk, then the files its fingerprint covers: the
 * first ones and "and N more". Both come from the workspace, so each is
 * escaped. The folder is written in full, with only the home folder as `~`:
 * a person deciding to trust it should see exactly where it sits.
 */
function locationLines(content: PluginTrustContent, folder: string): Phrase[] {
  const { shown, more } = pluginTrustFiles(content);
  const files = shown.map((path) => phrase`${rowIndent}${printable(path)}`);
  if (more > 0) files.push(phrase`${rowIndent}${pluginMessages.moreFiles(more).phrase}`);
  return [
    phrase``,
    pluginMessages.folderHeading().phrase,
    phrase`${rowIndent}${printable(shownFolder(folder))}`,
    ...(files.length === 0 ? [] : [phrase``, pluginMessages.filesHeading().phrase, ...files]),
  ];
}

/** The folder with the home folder written as `~`; the rest of the path stays. */
function shownFolder(folder: string): string {
  const profile = nodeProfileEnvironment();
  return withHomeAsTilde(profile.platform, profile.homeFolder, folder);
}

/**
 * The line that every tool asks a person first, then the tools grouped by what they do. The
 * line covers every group: a tool reaches agents through a connector, which counts even a
 * tool the plugin says reads as changing things until the connector file's `read` list names it.
 */
function toolRows(content: PluginTrustContent): Phrase[] {
  const groups = riskGroups.flatMap(({ risk, heading }) => {
    const names = content.tools
      .filter((tool) => tool.risk === risk)
      .map((tool) => phrase`${printable(tool.name)}`);
    return names.map((name, index) => row(index === 0 ? plainHeading(heading()) : "", name));
  });
  return [phrase`${rowIndent}${pluginMessages.toolsIntro().phrase}`, ...groups];
}

/** Each program with what starts it, then where it runs, as Studio labels it under an open program. */
function programRows(content: PluginTrustContent, programsRun: ProgramsRun): Phrase[] {
  return content.localTools.flatMap((tool) => {
    const command = [...startWords(tool.start), ...tool.args].join(" ");
    return [
      row(printable(tool.id), phrase`${printable(command)}`),
      phrase`${underRow}${pluginMessages.programsRun(programsRun).phrase}`,
    ];
  });
}

/** What starts the program: `npx @acme/tool 1.2.0` for a package, `node tools/run.js` for a script. */
function startWords(start: Record<string, unknown>): string[] {
  const { runner, name, version, program, path } = start;
  const words = typeof runner === "string" ? [runner, name, version] : [program, path];
  return words.filter((word): word is string => typeof word === "string");
}

/**
 * Each secret with where it goes: a backend's to the hosts Halonic's kit
 * sends it to; a program's to that program, as its variable, with where the
 * program may connect (HAL-12638), in Studio's words.
 */
function secretRows(content: PluginTrustContent): Phrase[] {
  return content.secrets.map((secret) => {
    const program = content.localTools.find((tool) => secret.part === `local:${tool.id}`);
    const where =
      program === undefined
        ? pluginMessages.secretGoesTo(secret.hosts.map(shownHost).join(", ")).phrase
        : phrase`${printable(pluginProgramSecretText(program, secret.name))}`;
    return row(printable(secret.name), where);
  });
}

/**
 * Each sign-in with its purpose, then the trust check line Studio shows
 * before **Sign in**, and the token host warning when the hosts differ. A
 * host a setting holds is named by that setting, as under Addresses. The
 * name, the purpose and the scope reasons are the plugin's text, so the
 * whole line is escaped.
 */
function signInRows(content: PluginTrustContent): Phrase[] {
  const service = content.plugin.name;
  return (content.signIns ?? []).flatMap((signIn) => {
    const facts = declaredSignInTrustFacts(signIn, shownHost);
    const line = pluginMessages.signInTrustLine(printable(signInTrustLine(service, facts)));
    const warning = signInTokenHostDiffers(facts)
      ? [
          phrase`${underRow}${markPart("needsYou")} ${pluginMessages.signInTokenHostWarning(printable(signInTokenHostWarning(facts))).phrase}`,
        ]
      : [];
    return [
      row(printable(signIn.name), phrase`${printable(signIn.purpose)}`),
      phrase`${underRow}${line.phrase}`,
      ...warning,
    ];
  });
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
