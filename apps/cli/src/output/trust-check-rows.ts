// The rows of the trust check (cli-output 3.5, revision 40): a program with
// its command, secrets, ! line and sites, an address (a plugin's with the
// hosts its backend reaches), a model provider's
// address, a local integration with the address each of its settings holds, an agent
// with its sites and folder, and a changed agent's or local integration's
// rows for what changed. `trust-check.ts` puts them in sections.

import { keyDestination } from "@halonicjs/adapter-workspace-models";
import {
  type AssistantAddedHosts,
  assistantAddedIn,
  type ProgramTrustFields,
  programTrustFields,
} from "@halonicjs/app";
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
import { dim, markPart, type Phrase, phrase, plainText } from "../messages/phrase.ts";
import { pluginMessages } from "../messages/plugin.ts";
import { type SecretPick, trustMessages } from "../messages/trust.ts";
import type { PluginHosts } from "../sheet-hosts.ts";
import { printable } from "./printable.ts";
import { shellWord } from "./shell-word.ts";
import { integrationAdditionLines } from "./trust-integration-additions.ts";
import {
  connectorLines,
  firstColumn,
  type LabelledLine,
  labelledLines,
  rowIndent,
  siteLines,
  underRow,
} from "./trust-row-lines.ts";

/** The workspace folder a local integration's connector names its folder in. */
const integrationsFolder = "integrations";

/**
 * "  mail-mcp      npx @acme/mail-mcp 2.3.1 · gets the secret GMAIL_TOKEN ·
 * takes AWS_PROFILE from your environment", then its ! line, its program and
 * connector lines, then, where the sandbox works, every site it may reach in
 * it, as an agent's. Without a
 * sandbox no site is shown, so the check suggests no fence that isn't there.
 */
export function programRow(
  connector: ConnectorTrustContent,
  unpinned: ReadonlySet<string>,
  sandboxWorks: boolean,
): Phrase[] {
  const fields = programTrustFields(connector);
  const withNames = withInherited(
    withSecrets(phrase`${printable(fields.command)}`, secretNames(connector)),
    fields.inherited.map(printable),
  );
  const lines = [row(printable(connector.id), withNames)];
  if (unpinned.has(connector.id)) {
    const warning = trustMessages.notPinned(fields.registry);
    lines.push(phrase`${underRow}${markPart("needsYou")} ${warning.phrase}`);
  }
  const sites = sandboxWorks ? siteLines(fields.sites) : [];
  return [
    ...lines,
    ...labelledLines([...programLines(fields), ...connectorLines(connector), ...sites]),
  ];
}

/**
 * "Resolved path" when the command was found, "Working folder" when it isn't the workspace's
 * own, then "Environment" and its own `env` entries, one `NAME=value` per line, by name.
 */
function programLines(fields: ProgramTrustFields): LabelledLine[] {
  return [
    ...(fields.path === undefined
      ? []
      : [[trustMessages.resolvedPath().phrase, phrase`${printable(fields.path)}`] as const]),
    ...(fields.workingFolder === undefined
      ? []
      : [
          [
            trustMessages.workingFolder().phrase,
            phrase`${printable(fields.workingFolder)}`,
          ] as const,
        ]),
    ...fields.environment.map(
      (entry, index) =>
        [
          index === 0 ? trustMessages.programEnvironment().phrase : phrase``,
          phrase`${printable(entry)}`,
        ] as const,
    ),
  ];
}

/** The sites a program connector may reach in a sandbox, in their stored form, or none. */
export function programSites(connector: ConnectorTrustContent): readonly string[] {
  return programTrustFields(connector).sites;
}

/**
 * "  inbox         https://mail.example.com/mcp · gets the secret INBOX_KEY".
 * A local integration's connector names its folder, with the secret each of
 * its sheet's secrets gets.
 * A plugin connector names its plugin, "  orders        plugin acme-orders",
 * and, when the plugin is installed here and its backend or a local tool
 * may reach hosts, the line "Reaches api.acme.example." under it (HAL-14860,
 * HAL-15094). The hosts come from
 * `pluginHosts`, the installed plugins' manifests, which the plugin's own
 * trust check covered; they show what the connector reaches and aren't in
 * the workspace's fingerprint. Every connector's row then has its connector
 * lines: tool lists, headers and other settings (HAL-16336).
 *
 * @param pluginHosts - the hosts each installed plugin may reach, by its id; left out, none are shown
 */
export function addressRows(
  connector: ConnectorTrustContent,
  pluginHosts: PluginHosts = new Map(),
): Phrase[] {
  return [...addressRowLines(connector, pluginHosts), ...labelledLines(connectorLines(connector))];
}

/** The connector's row with its address, and a plugin's Reaches line. */
function addressRowLines(connector: ConnectorTrustContent, pluginHosts: PluginHosts): Phrase[] {
  if (connector.transport === "integration") {
    return [integrationConnectorRow(connector)];
  }
  if (connector.transport !== "plugin") {
    const address =
      connector.transport === "http" ? text(connector.settings["url"]) : connector.transport;
    return [addressLine(connector, phrase`${printable(address)}`)];
  }
  const plugin = text(connector.settings["id"]);
  const hosts = [...new Set((pluginHosts.get(plugin) ?? []).map(shownHost))];
  return [
    addressLine(connector, trustMessages.pluginAddress(printable(plugin)).phrase),
    ...(hosts.length === 0
      ? []
      : [phrase`${underRow}${trustMessages.pluginReaches(hosts).phrase}`]),
  ];
}

/** The connector's row: its id, then `address` and the secrets it gets. */
function addressLine(connector: ConnectorTrustContent, address: Phrase): Phrase {
  return row(printable(connector.id), withSecrets(address, secretNames(connector)));
}

/** A host as a plugin's manifest writes it, or the setting that holds it, not yet escaped: for a line that is escaped whole. */
export function hostText(host: unknown): string {
  if (typeof host === "string") return host;
  const setting = (host as { fromSetting?: unknown } | null)?.fromSetting;
  const words = pluginMessages.hostFromSetting(typeof setting === "string" ? setting : "");
  return plainText(words.phrase);
}

/** A host as {@link hostText} gives it, escaped, where nothing else escapes it. */
export function shownHost(host: unknown): string {
  return printable(hostText(host));
}

/**
 * "  notes         integrations/notes · gets the secret my-notes-key (as notes-key)":
 * the folder the connector runs, then the workspace secret each secret of the
 * integration's sheet gets, by name only (HAL-14734, words from HAL-14737).
 */
function integrationConnectorRow(connector: ConnectorTrustContent): Phrase {
  const folder = phrase`${printable(`${integrationsFolder}/${text(connector.settings["folder"])}`)}`;
  const picks = secretPicks(connector);
  return row(
    printable(connector.id),
    picks.length === 0
      ? folder
      : phrase`${folder} ${markPart("separator")} ${trustMessages.getsPickedSecrets(picks).phrase}`,
  );
}

/**
 * The workspace secret each secret of a local integration's sheet gets, by
 * name, sorted by the sheet's name, such as `{ secret: "my-notes-key", as:
 * "notes-key" }`. A connector's own `secret` keeps its name.
 */
function secretPicks(connector: ConnectorTrustContent): SecretPick[] {
  const own = namesOf([connector.secret]).map((name) => ({ secret: name, as: name }));
  const picks = Object.entries(record(connector.settings["secrets"]))
    .sort(([first], [second]) => first.localeCompare(second, "en"))
    .flatMap(([as, reference]) =>
      namesOf([reference]).map((secret) => ({ secret, as: printable(as) })),
    );
  return [...own, ...picks];
}

/**
 * The addresses each stored model key may be sent to, by the key's name, for
 * the keys that have a list. A key with no list isn't in it.
 */
export type KeyAddressLists = ReadonlyMap<string, readonly string[]>;

/**
 * "  claude        https://api.anthropic.com/ · gets the secret ANTHROPIC_KEY":
 * where the provider sends its requests, or its type when the file names no
 * address and the adapter's own is used. A key that goes to another address than its
 * type's own gets a second line, "Sends its key to https://llm.example.com.".
 * A key whose list leaves out where it goes gets a ! line with the command
 * that allows it in its place, since a run with it would fail (HAL-15346,
 * HAL-15523).
 *
 * @param keyAddresses - the lists of the stored keys; left out, no list is checked
 */
export function providerRow(
  provider: ProviderTrustContent,
  keyAddresses: KeyAddressLists = new Map(),
): Phrase[] {
  const address = provider.baseUrl ?? provider.type;
  const destination = keyDestination(provider);
  const key = providerKeyName(provider);
  const notAllowed =
    destination === undefined || key === undefined
      ? []
      : notAllowedThere(key, destination.origin, keyAddresses.get(key));
  // The ! line names the address itself; "Sends its key to" would say the opposite (HAL-15523).
  const sends =
    destination === undefined || destination.isDefault || notAllowed.length > 0
      ? []
      : [phrase`${underRow}${trustMessages.keyDestination(printable(destination.origin)).phrase}`];
  return [
    row(
      printable(provider.id),
      withSecrets(phrase`${printable(address)}`, providerSecretNames(provider)),
    ),
    ...sends,
    ...notAllowed,
  ];
}

/**
 * "! https://other.example.com isn't allowed for key "gw-key", …", with
 * the command to paste, when the key has a list and the origin isn't on it.
 * An address that can't be read gets no line, as no command could allow it;
 * its run fails all the same.
 */
function notAllowedThere(
  key: string,
  origin: string,
  allowed: readonly string[] | undefined,
): Phrase[] {
  if (allowed === undefined || allowed.includes(origin) || URL.parse(origin) === null) {
    return [];
  }
  const command = `halonic models allow-address ${shellWord(key)} ${shellWord(origin)}`;
  const words = trustMessages.keyNotAllowedThere(printable(key), printable(origin), command);
  return [phrase`${underRow}${markPart("needsYou")} ${words.phrase}`];
}

/** The name of the secret that holds a provider's key, as stored, or `undefined` when it names none. */
export function providerKeyName(provider: ProviderTrustContent): string | undefined {
  return typeof provider.secret === "string"
    ? /^‹secret (.+)›$/u.exec(provider.secret)?.[1]
    : undefined;
}

/**
 * "  my-crm        CRM_URL   https://crm.example.com", then one line under it
 * per further setting, the names padded to the longest (team, HAL-3498).
 * After them, each host the assistant added to the sheet that the person
 * didn't name, with "added by the assistant" (HAL-525). The sheet's other
 * fixed hosts aren't listed.
 *
 * @param assistantAdded - the assistant-added hosts as the profile's review folder records them
 */
export function integrationRows(
  integration: IntegrationTrustContent,
  assistantAdded: AssistantAddedHosts = new Map(),
): Phrase[] {
  const settings = Object.entries(integration.addresses).map(
    ([name, address]) => [printable(name), settingAddress(address)] as const,
  );
  return namedRows(integration, [...settings, ...assistantAddedLines(integration, assistantAdded)]);
}

/** The assistant-added hosts' lines of {@link integrationRows}, without the settings. */
function assistantAddedLines(
  integration: IntegrationTrustContent,
  assistantAdded: AssistantAddedHosts,
): (readonly [string, Phrase])[] {
  const marked = assistantAddedIn(
    assistantAdded,
    integration.folder,
    Object.keys(integration.hosts),
  );
  return [...marked].map(
    (host) => [printable(host), trustMessages.assistantAddedHost().phrase] as const,
  );
}

/** The integration's id on the first line, then a padded name and its value on each line. */
function namedRows(
  integration: IntegrationTrustContent,
  lines: readonly (readonly [string, Phrase])[],
): Phrase[] {
  const width = Math.max(0, ...lines.map(([name]) => name.length));
  return lines.map(([name, value], index) => {
    const detail = phrase`${name.padEnd(width + columnGap)}${value}`;
    return index === 0 ? row(printable(integration.id), detail) : phrase`${underRow}${detail}`;
  });
}

/**
 * A changed local integration's Changed rows: its setting addresses when one
 * changed, else the hosts the assistant added, then its folder when it
 * moved, then "code changed" when a file in it changed, then a "New:" line for
 * each host, secret or tool it gained. Every other field is in the sheet.
 */
export function integrationChanges(
  integration: ChangedIntegration,
  assistantAdded: AssistantAddedHosts = new Map(),
): Phrase[] {
  const { id, before, after, fields } = integration;
  const changedRow = trustMessages.changedRow();
  const addresses = fields.includes("addresses")
    ? integrationRows(after, assistantAdded)
    : namedRows(after, assistantAddedLines(after, assistantAdded));
  return [
    ...tagged(addresses, changedRow),
    ...(fields.includes("folder")
      ? [
          withTag(
            row(
              printable(id),
              trustMessages.integrationFolderChanged(
                printable(before.folder),
                printable(after.folder),
              ).phrase,
            ),
            changedRow,
          ),
        ]
      : []),
    ...(fields.includes("code")
      ? [withTag(row(printable(id), trustMessages.integrationCodeChanged().phrase), changedRow)]
      : []),
    ...integrationAdditionLines(integration),
  ];
}

/** The address a setting holds, "not set", or why it can't be trusted. */
function settingAddress(address: string | null): Phrase {
  if (address === null) {
    return trustMessages.settingNotSet().phrase;
  }
  const refused = /^‹refused: (.+)›$/u.exec(address)?.[1];
  return refused === undefined
    ? phrase`${printable(address)}`
    : trustMessages.settingRefused(printable(refused)).phrase;
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

/**
 * The agent's id and program, then its sites, every one, its folder when it
 * isn't the default, and what it does without asking when it says `asks: in-sandbox`.
 */
export function agentRow(agent: AgentTrustContent): Phrase[] {
  const lines: LabelledLine[] = [
    ...siteLines(agent.allowedSites),
    ...(agent.workingFolder === undefined
      ? []
      : [
          [
            trustMessages.workingFolder().phrase,
            phrase`${dim(printable(agent.workingFolder))}`,
          ] as const,
        ]),
    ...(agent.asks === "in-sandbox"
      ? [[trustMessages.withoutAsking().phrase, trustMessages.inSandboxCalls().phrase] as const]
      : []),
  ];
  return [
    row(printable(agent.id), trustMessages.harnessName(printable(agent.harness)).phrase),
    ...labelledLines(lines),
  ];
}

/** One Changed row per field that changed, harness first, then sites, then the folder, then `asks`. */
export function agentFieldChanges(agent: ChangedAgent): Phrase[] {
  const { before, after } = agent;
  const changes: Phrase[] = [];
  if (before.harness !== after.harness) {
    const name = (harness: string) => trustMessages.harnessName(printable(harness)).phrase;
    changes.push(trustMessages.harnessChanged(name(before.harness), name(after.harness)).phrase);
  }
  const added = after.allowedSites.filter((site) => !before.allowedSites.includes(site));
  const removed = before.allowedSites.filter((site) => !after.allowedSites.includes(site));
  if (added.length + removed.length > 0) {
    changes.push(trustMessages.sitesChanged(added.map(printable), removed.map(printable)).phrase);
  }
  const folder = (content: AgentTrustContent) =>
    content.workingFolder ?? defaultWorkingFolder(content.id);
  if (folder(before) !== folder(after)) {
    changes.push(
      trustMessages.workingFolderChanged(printable(folder(before)), printable(folder(after)))
        .phrase,
    );
  }
  if (before.asks !== after.asks) {
    changes.push(trustMessages.asksChanged(after.asks === "in-sandbox").phrase);
  }
  return changes;
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

/**
 * The secrets a connector gets, by name: its own, the program's `secretEnv`
 * and the ones a local integration's connector picks, sorted.
 */
export function secretNames(connector: ConnectorTrustContent): string[] {
  const references = [
    connector.secret,
    ...Object.values(record(connector.settings["secretEnv"])),
    ...(connector.transport === "integration"
      ? Object.values(record(connector.settings["secrets"]))
      : []),
  ];
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
    .map((reference) => /^‹secret (.+)›$/u.exec(reference)?.[1])
    .map((name) => (name === undefined ? undefined : printable(name)));
  return [...new Set(names.filter((name) => name !== undefined))].sort();
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}
