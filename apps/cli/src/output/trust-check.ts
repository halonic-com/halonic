// Turns the `TrustService`'s check into the lines `halonic trust` and every
// command refused with exit code 3 print (cli-output 3.5 at revision 40):
// the heading, the summary, Programs, Agents, Addresses (with the model
// providers) and the full
// fingerprint, or the ✓ line when nothing changed. Every word comes from the
// catalogue; this file only decides which sentence goes where.

import type { TrustCheck } from "@halonicjs/app";
import type {
  ConnectorTrustContent,
  IntegrationTrustContent,
  TrustChanges,
} from "@halonicjs/workspace";
import { dayInWords, localDay } from "../messages/dates.ts";
import type { Message } from "../messages/define.ts";
import { markPart, type Phrase, phrase } from "../messages/phrase.ts";
import { type RowChanges, type TrustChangeCounts, trustMessages } from "../messages/trust.ts";
import {
  addressRow,
  agentFieldChanges,
  agentRow,
  integrationRows,
  programRow,
  providerRow,
  providerSecretNames,
  row,
  rowIndent,
  secretNames,
  tagged,
  withTag,
} from "./trust-check-rows.ts";

/** What the check doesn't hold, because only the host knows it. */
export interface TrustCheckFacts {
  /** The workspace's name, such as "Acme". */
  readonly name: string;
  /** The folder as the user gave it, such as "./acme". */
  readonly folder: string;
}

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
export function trustCheckLines(check: TrustCheck, facts: TrustCheckFacts): Phrase[] {
  if (check.status === "trusted") {
    const trustedOn = shownDate(check.trustedAt);
    return [marked("done", trustMessages.alreadyTrusted(facts.name, trustedOn))];
  }
  const unpinned = new Set(check.unpinned);
  const fingerprint = [
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
    ...(hasCounts(check.content) ? [trustMessages.startSummary(counts(check.content)).phrase] : []),
  ];
  return [
    ...heading,
    ...section(
      trustMessages.programsHeading(),
      programs(connectors).flatMap((row) => programRow(row, unpinned)),
    ),
    ...agentsSection(agents.flatMap((agent) => agentRow(agent))),
    ...section(trustMessages.addressesHeading(), [
      ...addresses(connectors).map((row) => addressRow(row)),
      ...integrations.flatMap(integrationRows),
      ...providers.map(providerRow),
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
  const integrationsOf = (rows: readonly IntegrationTrustContent[], tag: Message) =>
    rows.flatMap((row) => tagged(integrationRows(row), tag));
  return [
    trustMessages.changedHeading(facts.name, trustedOn).phrase,
    ...(hasChanges(changeCounts)
      ? [trustMessages.changeSummary(changeCounts, trustedOn).phrase]
      : []),
    ...section(
      trustMessages.programsHeading(),
      rowsOf(programs, (row) => programRow(row, unpinned)),
    ),
    ...agentsSection([
      ...changes.agents.added.flatMap((agent) => tagged(agentRow(agent), newRow)),
      ...changes.agents.changed.flatMap((agent) =>
        agentFieldChanges(agent).map((change) => withTag(row(agent.id, change), changedRow)),
      ),
    ]),
    ...section(trustMessages.addressesHeading(), [
      ...rowsOf(addresses, (row) => [addressRow(row)]),
      ...integrationsOf(changes.integrations.added, newRow),
      ...integrationsOf(
        changes.integrations.changed.map((row) => row.after),
        changedRow,
      ),
      ...changes.providers.added.map((row) => withTag(providerRow(row), newRow)),
      ...changes.providers.changed.map((row) => withTag(providerRow(row.after), changedRow)),
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

function counts(content: TrustCheck["content"]) {
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
        (sum, integration) => sum + Object.keys(integration.addresses).length,
        0,
      ) +
      providers.length,
    sites: new Set(agents.flatMap((agent) => agent.allowedSites)).size,
  };
}

function hasCounts(content: TrustCheck["content"]): boolean {
  return Object.values(counts(content)).some((count) => count > 0);
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
