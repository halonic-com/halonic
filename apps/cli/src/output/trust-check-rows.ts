// The rows of the trust check (cli-output 3.5, revision 40): a program with
// its command, secrets, ! line and sites, an address, a model provider's
// address, a local integration with the address each of its settings holds, an agent
// with its sites and folder, and a changed agent's or local integration's
// rows for what changed. `trust-check.ts` puts them in sections.

import { programName } from "@halonicjs/app";
import { defaultWorkingFolder } from "@halonicjs/format";
import type {
  AgentTrustContent,
  ChangedAgent,
  ChangedIntegration,
  ConnectorTrustContent,
  IntegrationTrustContent,
  ProviderTrustContent,
} from "@halonicjs/workspace";
import { columnGap } from "../messages/columns.ts";
import type { Message } from "../messages/define.ts";
import { dim, markPart, type Phrase, phrase, visibleLength } from "../messages/phrase.ts";
import { type PackageRegistry, trustMessages } from "../messages/trust.ts";

/**
 * The first column: a row's id, at least as wide as cli-output 3.5's example,
 * so short ids line up the same way. Lines under a row start past it.
 */
const firstColumn = 14;

/** Where a section's rows start. */
export const rowIndent = "  ";

/** Where the lines under a row start: under its second column. */
const underRow = " ".repeat(rowIndent.length + firstColumn);

/**
 * "  mail-mcp      npx @acme/mail-mcp 2.3.1 · gets the secret GMAIL_TOKEN ·
 * takes AWS_PROFILE from your environment", then its ! line, then every site
 * it may reach in a sandbox, as an agent's.
 */
export function programRow(
  connector: ConnectorTrustContent,
  unpinned: ReadonlySet<string>,
): Phrase[] {
  const command = [text(connector.settings["command"]), ...strings(connector.settings["args"])];
  const withNames = withInherited(
    withSecrets(phrase`${command.join(" ")}`, secretNames(connector)),
    strings(connector.settings["inheritEnv"]),
  );
  const lines = [row(connector.id, withNames)];
  if (unpinned.has(connector.id)) {
    const warning = trustMessages.notPinned(
      registryOf(text(connector.settings["command"]), command),
    );
    lines.push(phrase`${underRow}${markPart("needsYou")} ${warning.phrase}`);
  }
  return [...lines, ...labelledLines(siteLines(programSites(connector)))];
}

/** The sites a program connector may reach in a sandbox, in their stored form, or none. */
export function programSites(connector: ConnectorTrustContent): string[] {
  return strings(connector.settings["sites"]);
}

/** "  inbox         https://mail.example.com/mcp · gets the secret INBOX_KEY". */
export function addressRow(connector: ConnectorTrustContent): Phrase {
  const address =
    connector.transport === "http" ? text(connector.settings["url"]) : connector.transport;
  return row(connector.id, withSecrets(phrase`${address}`, secretNames(connector)));
}

/**
 * "  claude        https://api.anthropic.com/ · gets the secret ANTHROPIC_KEY":
 * where the provider sends its requests, or its type when the file names no
 * address and the adapter's own is used.
 */
export function providerRow(provider: ProviderTrustContent): Phrase {
  const address = provider.baseUrl ?? provider.type;
  return row(provider.id, withSecrets(phrase`${address}`, providerSecretNames(provider)));
}

/**
 * "  my-crm        CRM_URL   https://crm.example.com", then one line under it
 * per further setting, the names padded to the longest (team, HAL-3498).
 */
export function integrationRows(integration: IntegrationTrustContent): Phrase[] {
  const settings = Object.entries(integration.addresses);
  const width = Math.max(0, ...settings.map(([name]) => name.length));
  return settings.map(([name, address], index) => {
    const detail = phrase`${name.padEnd(width + columnGap)}${settingAddress(address)}`;
    return index === 0 ? row(integration.id, detail) : phrase`${underRow}${detail}`;
  });
}

/**
 * A changed local integration's Changed rows: its setting addresses when one
 * changed, then its folder when it moved, then "code changed" when a file
 * in it changed. Every other field is in the sheet, so a change to one is a
 * change to the code too.
 */
export function integrationChanges(integration: ChangedIntegration): Phrase[] {
  const { id, before, after, fields } = integration;
  const changedRow = trustMessages.changedRow();
  return [
    ...(fields.includes("addresses") ? tagged(integrationRows(after), changedRow) : []),
    ...(fields.includes("folder")
      ? [
          withTag(
            row(id, trustMessages.integrationFolderChanged(before.folder, after.folder).phrase),
            changedRow,
          ),
        ]
      : []),
    ...(fields.includes("code")
      ? [withTag(row(id, trustMessages.integrationCodeChanged().phrase), changedRow)]
      : []),
  ];
}

/** The address a setting holds, "not set", or why it can't be trusted. */
function settingAddress(address: string | null): Phrase {
  if (address === null) {
    return trustMessages.settingNotSet().phrase;
  }
  const refused = /^‹refused: (.+)›$/u.exec(address)?.[1];
  return refused === undefined ? phrase`${address}` : trustMessages.settingRefused(refused).phrase;
}

/** The detail, then "· gets the secret GMAIL_TOKEN" when there are any. */
function withSecrets(detail: Phrase, secrets: readonly string[]): Phrase {
  return secrets.length === 0
    ? detail
    : phrase`${detail} ${markPart("separator")} ${trustMessages.getsSecrets(secrets).phrase}`;
}

/** The detail, then "· takes AWS_PROFILE from your environment" when it takes any. */
function withInherited(detail: Phrase, names: readonly string[]): Phrase {
  return names.length === 0
    ? detail
    : phrase`${detail} ${markPart("separator")} ${trustMessages.takesFromEnvironment(names).phrase}`;
}

/** The agent's id and program, then its sites, every one, and its folder when it isn't the default. */
export function agentRow(agent: AgentTrustContent): Phrase[] {
  const lines: LabelledLine[] = [
    ...siteLines(agent.allowedSites),
    ...(agent.workingFolder === undefined
      ? []
      : [[trustMessages.workingFolder().phrase, phrase`${dim(agent.workingFolder)}`] as const]),
  ];
  return [row(agent.id, trustMessages.harnessName(agent.harness).phrase), ...labelledLines(lines)];
}

/** A line under a row: its label, empty to continue the one above, and its value. */
type LabelledLine = readonly [label: Phrase, value: Phrase];

/** "Allowed sites" and the first site, then every other site under it. */
function siteLines(sites: readonly string[]): LabelledLine[] {
  return sites.map((site, index) => [
    index === 0 ? trustMessages.allowedSites().phrase : phrase``,
    shownSite(site),
  ]);
}

/** The lines under a row, their values lined up past the longest label. */
function labelledLines(lines: readonly LabelledLine[]): Phrase[] {
  const width = Math.max(0, ...lines.map(([label]) => visibleLength(label, true)));
  return lines.map(([label, value]) => {
    const padding = " ".repeat(width - visibleLength(label, true) + columnGap);
    return phrase`${underRow}${label}${padding}${value}`;
  });
}

/** One Changed row per field that changed, harness first, then sites, then the folder. */
export function agentFieldChanges(agent: ChangedAgent): Phrase[] {
  const { before, after } = agent;
  const changes: Phrase[] = [];
  if (before.harness !== after.harness) {
    const name = (harness: string) => trustMessages.harnessName(harness).phrase;
    changes.push(trustMessages.harnessChanged(name(before.harness), name(after.harness)).phrase);
  }
  const added = after.allowedSites.filter((site) => !before.allowedSites.includes(site));
  const removed = before.allowedSites.filter((site) => !after.allowedSites.includes(site));
  if (added.length + removed.length > 0) {
    changes.push(trustMessages.sitesChanged(added, removed).phrase);
  }
  const folder = (content: AgentTrustContent) =>
    content.workingFolder ?? defaultWorkingFolder(content.id);
  if (folder(before) !== folder(after)) {
    changes.push(trustMessages.workingFolderChanged(folder(before), folder(after)).phrase);
  }
  return changes;
}

/** A site in its stored form, with its note: a wildcard names its domain, Punycode is flagged. */
function shownSite(site: string): Phrase {
  const notes = [
    ...(site.startsWith("*.") ? [trustMessages.everySiteUnder(site.slice(2)).phrase] : []),
    ...(site.split(".").some((label) => label.startsWith("xn--"))
      ? [trustMessages.nonLatin().phrase]
      : []),
  ];
  return notes.reduce(
    (shown, note) => phrase`${shown} ${markPart("separator")} ${note}`,
    phrase`${site}`,
  );
}

/** The row's id in the first column, then its detail. */
export function row(id: string, detail: Phrase): Phrase {
  return phrase`${rowIndent}${id.padEnd(firstColumn - columnGap)}${" ".repeat(columnGap)}${detail}`;
}

/** The tag after a row's first line; the lines under it stay as they are. */
export function tagged(lines: readonly Phrase[], tag: Message): Phrase[] {
  return lines.map((line, index) => (index === 0 ? withTag(line, tag) : line));
}

/** The line with a New or Changed tag at its end. */
export function withTag(line: Phrase, tag: Message): Phrase {
  return phrase`${line}${" ".repeat(columnGap)}${tag.phrase}`;
}

/** The secrets a connector gets, by name: its own and the program's `secretEnv`, sorted. */
export function secretNames(connector: ConnectorTrustContent): string[] {
  const references = [connector.secret, ...Object.values(record(connector.settings["secretEnv"]))];
  return namesOf(references);
}

/** The secret a model provider gets, by name, or none. */
export function providerSecretNames(provider: ProviderTrustContent): string[] {
  return namesOf([provider.secret]);
}

/** The names in `‹secret NAME›` references, each once and sorted. */
function namesOf(references: readonly unknown[]): string[] {
  const names = references
    .filter((value) => typeof value === "string")
    .map((reference) => /^‹secret (.+)›$/u.exec(reference)?.[1]);
  return [...new Set(names.filter((name) => name !== undefined))].sort();
}

/** PyPI for `uvx`, `uv tool run` and `pipx run`; npm for every other package runner. */
function registryOf(command: string, words: readonly string[]): PackageRegistry {
  const python = new Set(["uvx", "uv", "pipx"]);
  return python.has(programName(command)) || words.some((word) => python.has(programName(word)))
    ? "PyPI"
    : "npm";
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}
