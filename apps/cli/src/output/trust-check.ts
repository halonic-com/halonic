// Turns the `TrustService`'s check into the lines `halonic trust` and every
// command refused with exit code 3 print (cli-output 3.5 at revision 40):
// the heading, the summary, Programs, Agents, Addresses (with the model
// providers) and the full
// fingerprint, or the ✓ line when nothing changed. Every word comes from the
// catalogue; this file only decides which sentence goes where.

import { type AssistantAddedHosts, assistantAddedIn, type TrustCheck } from "@halonicjs/app";
import type { ConnectorTrustContent, TrustChanges } from "@halonicjs/workspace";
import { dayInWords, localDay } from "../messages/dates.ts";
import type { Message } from "../messages/define.ts";
import { markPart, type Phrase, phrase } from "../messages/phrase.ts";
import { type RowChanges, type TrustChangeCounts, trustMessages } from "../messages/trust.ts";
import type { PluginHosts } from "../sheet-hosts.ts";
import { printable } from "./printable.ts";
import {
  addressRows,
  agentFieldChanges,
  agentRow,
  integrationChanges,
  integrationRows,
  type KeyAddressLists,
  programRow,
  programSites,
  providerRow,
  providerSecretNames,
  row,
  secretNames,
  tagged,
  withTag,
} from "./trust-check-rows.ts";
import { rowIndent } from "./trust-row-lines.ts";

/** What the check doesn't hold, because only the host knows it. */
export interface TrustCheckFacts {
  /** The workspace's name, such as "Acme". */
  readonly name: string;
  /** The folder as the user gave it, such as "./acme". */
  readonly folder: string;
  /**
   * Whether this computer's sandbox works. A program's sites are shown only
   * then, since without a sandbox nothing keeps it to them. Left out means no.
   */
  readonly sandboxWorks?: boolean;
  /**
   * The hosts each plugin installed here may reach, its backend's and its
   * local tools', by its id, shown under a plugin connector's row (HAL-14860,
   * HAL-15094). Left out, no plugin's hosts are shown.
   */
  readonly pluginHosts?: PluginHosts;
  /**
   * The addresses each stored model key may be sent to, for the keys that
   * have a list, so a provider whose key's list leaves out where it goes
   * gets a ! line (HAL-15346). Left out, no key's list is checked.
   */
  readonly keyAddresses?: KeyAddressLists;
  /**
   * The files the check covers that have saved changes that aren't
   * committed, workspace-relative (HAL-16335): named on one dimmed line
   * after the rows and before the fingerprint, so the last line stays the
   * fingerprint a script reads. Left out or empty, there is no such line.
   */
  readonly notCommitted?: readonly string[];
  /**
   * The hosts the assistant added to local integrations' sheets that the
   * person didn't name, from the profile's review folder (HAL-525): each is
   * listed under its integration with "added by the assistant". Left out, none.
   */
  readonly assistantAdded?: AssistantAddedHosts;
}

/** The dimmed line naming `files`, escaped, or none when there are none. */
export function notCommittedLines(files: readonly string[]): Phrase[] {
  if (files.length === 0) return [];
  return [trustMessages.notCommitted(files.map((file) => printable(file))).phrase];
}

/** A check with a fingerprint: every status but `refused`, which stops before any line is shown. */
export type FingerprintedCheck = Exclude<TrustCheck, { readonly status: "refused" }>;

/**
 * The trust check's lines. A trusted workspace gets the one ✓ line; any
 * other gets the check: the heading and summary (or, when it changed since
 * it was trusted, the changed heading and what changed, with only the New
 * and Changed rows), then the sections that have rows, then the full
 * fingerprint. An unreadable list of trusted workspaces starts with its !
 * line, then the check of a new workspace.
 *
 * @example
 * trustCheckLines(check, { name: "Acme", folder: "./acme" });
 * // ["Trust check for Acme (./acme)", "Before anything in Acme runs …",
 * //  "Will start 2 programs …", "", "Programs", "  mail-mcp      npx …", …,
 * //  "", "Fingerprint", "  hfp1:c9b6…"] (as phrases)
 */
export function trustCheckLines(check: FingerprintedCheck, rawFacts: TrustCheckFacts): Phrase[] {
  // The name and the folder come from the workspace, so they are escaped once, here.
  const facts = { ...rawFacts, name: printable(rawFacts.name), folder: printable(rawFacts.folder) };
  const notCommitted = notCommittedLines(rawFacts.notCommitted ?? []);
  if (check.status === "trusted") {
    const trustedOn = shownDate(check.trustedAt);
    return [marked("done", trustMessages.alreadyTrusted(facts.name, trustedOn)), ...notCommitted];
  }
  const unpinned = new Set(check.unpinned);
  const fingerprint = [
    ...(notCommitted.length === 0 ? [] : [phrase``, ...notCommitted]),
    phrase``,
    trustMessages.fingerprintHeading().phrase,
    phrase`${rowIndent}${check.fingerprint}`,
  ];
  if (check.status === "changed") {
    return [
      ...changedLines(check.changes, shownDate(check.trustedAt), facts, unpinned),
      ...fingerprint,
    ];
  }
  const { connectors, agents = [], integrations = [], providers = [] } = check.content;
  const heading = [
    ...(check.status === "unreadable" ? [marked("needsYou", trustMessages.listUnreadable())] : []),
    trustMessages.heading(facts.name, facts.folder).phrase,
    trustMessages.intro(facts.name).phrase,
    ...(hasCounts(check.content, facts)
      ? [trustMessages.startSummary(counts(check.content, facts)).phrase]
      : []),
  ];
  return [
    ...heading,
    ...section(
      trustMessages.programsHeading(),
      programs(connectors).flatMap((row) => programRow(row, unpinned, facts.sandboxWorks === true)),
    ),
    ...agentsSection(agents.flatMap((agent) => agentRow(agent))),
    ...section(trustMessages.addressesHeading(), [
      ...addresses(connectors).flatMap((row) => addressRows(row, facts.pluginHosts)),
      ...integrations.flatMap((row) => integrationRows(row, facts.assistantAdded)),
      ...providers.flatMap((provider) => providerRow(provider, facts.keyAddresses)),
    ]),
    ...fingerprint,
  ];
}

function changedLines(
  changes: TrustChanges,
  trustedOn: string,
  facts: TrustCheckFacts,
  unpinned: ReadonlySet<string>,
): Phrase[] {
  const newRow = trustMessages.newRow();
  const changedRow = trustMessages.changedRow();
  const kindChanges = (isKind: (row: ConnectorTrustContent) => boolean): RowChanges => ({
    added: changes.added.filter(isKind).length,
    changed: changes.changed.filter((row) => isKind(row.after)).length,
  });
  const connectorAddresses = kindChanges((row) => !isProgram(row));
  const changeCounts: TrustChangeCounts = {
    programs: kindChanges(isProgram),
    agents: { added: changes.agents.added.length, changed: changes.agents.changed.length },
    // A local integration counts as one address, however many settings it reads.
    addresses: {
      added:
        connectorAddresses.added +
        changes.integrations.added.length +
        changes.providers.added.length,
      changed:
        connectorAddresses.changed +
        changes.integrations.changed.length +
        changes.providers.changed.length,
    },
  };
  const rowsOf = (
    pick: (rows: ConnectorTrustContent[]) => ConnectorTrustContent[],
    show: (row: ConnectorTrustContent) => Phrase[],
  ) => [
    ...pick(changes.added).flatMap((row) => tagged(show(row), newRow)),
    ...pick(changes.changed.map((row) => row.after)).flatMap((row) =>
      tagged(show(row), changedRow),
    ),
  ];
  return [
    trustMessages.changedHeading(facts.name, trustedOn).phrase,
    ...(hasChanges(changeCounts)
      ? [trustMessages.changeSummary(changeCounts, trustedOn).phrase]
      : []),
    ...section(
      trustMessages.programsHeading(),
      rowsOf(programs, (row) => programRow(row, unpinned, facts.sandboxWorks === true)),
    ),
    ...agentsSection([
      ...changes.agents.added.flatMap((agent) => tagged(agentRow(agent), newRow)),
      ...changes.agents.changed.flatMap((agent) =>
        agentFieldChanges(agent).map((change) =>
          withTag(row(printable(agent.id), change), changedRow),
        ),
      ),
    ]),
    ...section(trustMessages.addressesHeading(), [
      ...rowsOf(addresses, (row) => addressRows(row, facts.pluginHosts)),
      ...changes.integrations.added.flatMap((row) =>
        tagged(integrationRows(row, facts.assistantAdded), newRow),
      ),
      ...changes.integrations.changed.flatMap((row) =>
        integrationChanges(row, facts.assistantAdded),
      ),
      ...changes.providers.added.flatMap((row) =>
        tagged(providerRow(row, facts.keyAddresses), newRow),
      ),
      ...changes.providers.changed.flatMap((row) =>
        tagged(providerRow(row.after, facts.keyAddresses), changedRow),
      ),
    ]),
  ];
}

/** Whether the summary has anything to name, so it never prints an empty sentence. */
function hasChanges(changes: TrustChangeCounts): boolean {
  return Object.values(changes).some((rows: RowChanges) => rows.added + rows.changed > 0);
}

/** A section with its heading after an empty line, or nothing when it has no rows. */
function section(heading: Message, rows: readonly Phrase[]): Phrase[] {
  return rows.length === 0 ? [] : [phrase``, heading.phrase, ...rows];
}

/** The Agents section, with its sub-line; left out when no agent runs in Claude Code or Codex. */
function agentsSection(rows: readonly Phrase[]): Phrase[] {
  const intro = phrase`${rowIndent}${trustMessages.agentsIntro().phrase}`;
  return rows.length === 0 ? [] : section(trustMessages.agentsHeading(), [intro, ...rows]);
}

function marked(mark: "done" | "needsYou", message: Message): Phrase {
  return phrase`${markPart(mark)} ${message.phrase}`;
}

function counts(content: TrustCheck["content"], facts: TrustCheckFacts) {
  const sandboxWorks = facts.sandboxWorks === true;
  const marks = facts.assistantAdded ?? new Map();
  const agents = content.agents ?? [];
  const providers = content.providers ?? [];
  return {
    programs: programs(content.connectors).length,
    agents: agents.length,
    secrets: new Set([
      ...content.connectors.flatMap(secretNames),
      ...providers.flatMap(providerSecretNames),
    ]).size,
    addresses:
      addresses(content.connectors).length +
      (content.integrations ?? []).reduce(
        (sum, integration) =>
          sum +
          Object.keys(integration.addresses).length +
          assistantAddedIn(marks, integration.folder, Object.keys(integration.hosts)).size,
        0,
      ) +
      providers.length,
    sites: new Set([
      ...agents.flatMap((agent) => agent.allowedSites),
      ...(sandboxWorks ? programs(content.connectors).flatMap(programSites) : []),
    ]).size,
  };
}

function hasCounts(content: TrustCheck["content"], facts: TrustCheckFacts): boolean {
  return Object.values(counts(content, facts)).some((count) => count > 0);
}

function isProgram(connector: ConnectorTrustContent): boolean {
  return connector.transport === "stdio";
}

function programs(connectors: readonly ConnectorTrustContent[]): ConnectorTrustContent[] {
  return connectors.filter(isProgram);
}

function addresses(connectors: readonly ConnectorTrustContent[]): ConnectorTrustContent[] {
  return connectors.filter((connector) => !isProgram(connector));
}

/** "3 Nov": the day and the month in the computer's own time zone, as cli-output writes dates. */
export function shownDate(iso: string): string {
  return dayInWords(localDay(new Date(iso)));
}
