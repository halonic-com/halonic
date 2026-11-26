import { keyDestination } from "@halonicjs/adapter-workspace-models";
import { type AssistantAddedHosts, programTrustFields, type TrustCheck } from "@halonicjs/app";
import type {
  TrustReview,
  TrustRowView,
  TrustSectionView,
} from "@halonicjs/studio-feature-workspace";
import type {
  ConnectorTrustContent,
  ProviderTrustContent,
  TrustChanges,
} from "@halonicjs/workspace";
import { agentChangeRows, agentRow, siteLines, withoutAsking } from "./agent-trust-rows.ts";
import { secretNames, secretPicks } from "./connector-secrets.ts";
import { connectorLines } from "./connector-trust-lines.ts";
import {
  changedIntegrationRow,
  type IntegrationRuns,
  integrationRow,
  integrationsIntro,
  secretName,
} from "./integration-trust-rows.ts";
import { listed } from "./listed.ts";
import { type PluginHosts, pluginConnectorRow } from "./plugin-connector-row.ts";
import { changedProgramRow } from "./program-change-lines.ts";

/** What the check doesn't hold, because only the host knows it. */
export interface TrustReviewFacts {
  /** The workspace's name, such as "Acme". */
  readonly name: string;
  /** Its folder, such as "/work/acme". */
  readonly folder: string;
  /** Whether its local integrations run in the sandbox on this computer; left out, unsaid. */
  readonly runs?: IntegrationRuns;
  /** Each installed plugin's backend hosts, for a plugin connector's Reaches line (HAL-15123). */
  readonly pluginHosts?: PluginHosts;
  /**
   * The hosts the assistant added to local integrations' sheets that the person didn't name, from
   * the profile's review folder: the Reaches row marks them (HAL-525). Left out, none.
   */
  readonly assistantAdded?: AssistantAddedHosts;
}

export type { IntegrationRuns } from "./integration-trust-rows.ts";

/** The fixed last line while programs run without the agent sandbox (states-flow-map F11). */
export const noSandboxFootnote =
  "Programs you trust run with your access to files and the network. Halonic doesn't limit what they do once they've started.";

const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "3 Nov": the day and the month in the computer's own time zone, as the CLI writes dates. */
export function shownDate(iso: string): string {
  const date = new Date(iso);
  return `${date.getDate()} ${months[date.getMonth()]}`;
}

/**
 * What the trust check shows (mockup-trust rev 2, the same content and words as `halonic trust`):
 * the first-time check, or "What changed" for a workspace whose record no longer matches.
 * `undefined` for a trusted workspace, which has nothing to review.
 *
 * @example
 * trustReviewOf(check, { name: "Acme", folder: "/work/acme" })?.title; // "Trust Acme?"
 */
export function trustReviewOf(check: TrustCheck, facts: TrustReviewFacts): TrustReview | undefined {
  if (check.status === "trusted") return undefined;
  const source = `${facts.name} · ${facts.folder}`;
  if (check.status === "refused") {
    return {
      title: `Trust ${facts.name}?`,
      source,
      changed: false,
      summary: [],
      sections: [],
      fingerprint: "",
      unpinned: [],
      refused: `${check.refused
        .map(({ kind, id, reason }) => `The ${kind} ${id} can't be trusted, because ${reason}`)
        .join("; ")}. Fix it in its file, then review again.`,
      footnote: noSandboxFootnote,
    };
  }
  const common = {
    source,
    fingerprint: check.fingerprint,
    unpinned: check.unpinned,
    footnote: noSandboxFootnote,
    unreadable:
      check.status === "unreadable"
        ? "Halonic couldn't read its list of trusted workspaces, so it's asking again."
        : undefined,
  };
  const unpinned = new Set(check.unpinned);
  if (check.status === "changed") {
    const since = shownDate(check.trustedAt);
    return {
      ...common,
      title: `${facts.name} changed since you trusted it on ${since}`,
      changed: true,
      ...changesView(check.changes, since, unpinned, facts),
    };
  }
  const { connectors, agents = [], integrations = [], providers = [] } = check.content;
  return {
    ...common,
    title: `Trust ${facts.name}?`,
    changed: false,
    summary: startSummary(check.content, facts.runs),
    sections: sectionsOf(
      programs(connectors).map((row) => programRow(row, unpinned, facts.runs)),
      integrations.map((row) => integrationRow(row, facts.runs, facts.assistantAdded)),
      agents.map(agentRow),
      [
        ...addresses(connectors).map((row) => addressRow(row, facts.pluginHosts)),
        ...providers.map(providerRow),
      ],
      facts.runs,
    ),
  };
}

function changesView(
  changes: TrustChanges,
  since: string,
  unpinned: ReadonlySet<string>,
  facts: TrustReviewFacts,
): Pick<TrustReview, "summary" | "sections" | "unchanged"> {
  const { runs, pluginHosts, assistantAdded } = facts;
  const kind = (isKind: (row: ConnectorTrustContent) => boolean) => ({
    added: changes.added.filter(isKind).length,
    changed: changes.changed.filter((row) => isKind(row.after)).length,
  });
  const connectorAddresses = kind((row) => !isProgram(row));
  const counts = [
    ["program", kind(isProgram)],
    [
      "integration",
      { added: changes.integrations.added.length, changed: changes.integrations.changed.length },
    ],
    ["agent", { added: changes.agents.added.length, changed: changes.agents.changed.length }],
    [
      "address",
      {
        added: connectorAddresses.added + changes.providers.added.length,
        changed: connectorAddresses.changed + changes.providers.changed.length,
      },
    ],
  ] as const;
  const parts = counts.flatMap(([noun, { added, changed }]) => [
    ...(added > 0 ? [counted(added, `new ${noun}`)] : []),
    ...(changed > 0 ? [counted(changed, `changed ${noun}`)] : []),
  ]);
  const [only] = parts;
  let summary: string[] = [];
  if (parts.length === 1 && only?.startsWith("1 ")) {
    summary = [`${only} since you trusted this on ${since}.`];
  } else if (parts.length > 0) {
    summary = [`${listed(parts)}.`];
  }
  const tagged = (rows: readonly TrustRowView[], tag: "New" | "Changed") =>
    rows.map((row) => ({ ...row, tag }));
  const pick = (rows: ConnectorTrustContent[], isKind: (row: ConnectorTrustContent) => boolean) =>
    rows.filter(isKind);
  const changedConnectors = changes.changed.map((row) => row.after);
  const address = (row: ConnectorTrustContent) => addressRow(row, pluginHosts);
  const unchanged =
    changes.unchanged +
    changes.agents.unchanged +
    changes.integrations.unchanged +
    changes.providers.unchanged;
  return {
    summary,
    sections: sectionsOf(
      [
        ...tagged(
          pick(changes.added, isProgram).map((row) => programRow(row, unpinned, runs)),
          "New",
        ),
        ...tagged(
          changes.changed
            .filter((row) => isProgram(row.after))
            .map(({ before, after }) =>
              changedProgramRow(
                programRow(after, unpinned, runs),
                programRow(before, unpinned, runs),
              ),
            ),
          "Changed",
        ),
      ],
      [
        ...tagged(
          changes.integrations.added.map((row) => integrationRow(row, runs, assistantAdded)),
          "New",
        ),
        ...tagged(
          changes.integrations.changed.map((row) =>
            changedIntegrationRow(row, runs, assistantAdded),
          ),
          "Changed",
        ),
      ],
      [
        ...tagged(changes.agents.added.map(agentRow), "New"),
        ...tagged(changes.agents.changed.flatMap(agentChangeRows), "Changed"),
      ],
      [
        ...tagged(pick(changes.added, isAddress).map(address), "New"),
        ...tagged(pick(changedConnectors, isAddress).map(address), "Changed"),
        ...tagged(changes.providers.added.map(providerRow), "New"),
        ...tagged(
          changes.providers.changed.map((row) => providerRow(row.after)),
          "Changed",
        ),
      ],
      runs,
      true,
    ),
    unchanged:
      unchanged > 0 ? `Unchanged (${unchanged} ${unchanged === 1 ? "item" : "items"})` : undefined,
  };
}

function sectionsOf(
  programRows: readonly TrustRowView[],
  integrationRows: readonly TrustRowView[],
  agentRows: readonly TrustRowView[],
  addressRows: readonly TrustRowView[],
  runs: IntegrationRuns,
  changed = false,
): TrustSectionView[] {
  const heading = (name: string, rows: readonly TrustRowView[]) =>
    changed ? name : `${name} (${rows.length})`;
  const sections: TrustSectionView[] = [
    {
      heading: heading("Programs", programRows),
      rows: programRows,
      open: programRows.some((row) => row.warning !== undefined) || changed,
    },
    {
      heading: heading("Integrations", integrationRows),
      intro: integrationsIntro,
      rows: integrationRows,
      // Not in the sandbox, the section opens by itself, with the triangle, so the person sees it.
      open: runs?.state === "not-fenced" || changed,
      mark: runs?.state === "not-fenced" ? "warning" : undefined,
    },
    {
      heading: heading("Agents", agentRows),
      intro: "Agents in this workspace that run in Claude Code or Codex.",
      rows: agentRows,
      // Open when an agent acts without asking, so the line isn't folded away (HAL-15117).
      open:
        changed || agentRows.some((row) => row.lines.some(([label]) => label === withoutAsking)),
    },
    {
      heading: heading("Addresses", addressRows),
      intro: "Addresses named in this workspace. Programs above may connect elsewhere.",
      rows: addressRows,
      open: changed,
    },
  ];
  return sections.filter((section) => section.rows.length > 0);
}

/**
 * A program's row, with the fields the CLI's row shows (HAL-16323): its command, the secrets it
 * gets and the names it takes from the environment, then the path it runs ("Runs", microcopy 4.3),
 * its working folder, its own environment, one `NAME=value` per line, its connector lines and,
 * where it runs in the sandbox, its sites. Without the sandbox no site is shown, so the check suggests no fence that
 * isn't there. Names, paths, entries and sites are code, so they show in mono (C706).
 */
function programRow(
  connector: ConnectorTrustContent,
  unpinned: ReadonlySet<string>,
  runs: IntegrationRuns,
): TrustRowView {
  const fields = programTrustFields(connector);
  const secrets = secretNames(connector);
  return {
    id: connector.id,
    detail: fields.command,
    lines: [
      ...(secrets.length === 0 ? [] : [["Gets secrets", secrets.join(", "), "code"] as const]),
      ...(fields.inherited.length === 0
        ? []
        : [["Takes from your environment", fields.inherited.join(", "), "code"] as const]),
      ...(fields.path === undefined ? [] : [["Runs", fields.path, "code"] as const]),
      ...(fields.workingFolder === undefined
        ? []
        : [["Working folder", fields.workingFolder, "code"] as const]),
      ...fields.environment.map(
        (entry, index) => [index === 0 ? "Environment" : "", entry, "code"] as const,
      ),
      ...connectorLines(connector),
      ...(runs?.state === "fenced" ? siteLines(fields.sites) : []),
    ],
    warning: unpinned.has(connector.id)
      ? `Can download new code from ${fields.registry} when it starts: version not pinned.`
      : undefined,
  };
}

/** A connector reached by an address, then its connector lines: tools, headers, other settings. */
function addressRow(
  connector: ConnectorTrustContent,
  pluginHosts: PluginHosts | undefined,
): TrustRowView {
  const row = addressOnlyRow(connector, pluginHosts);
  return { ...row, lines: [...row.lines, ...connectorLines(connector)] };
}

function addressOnlyRow(
  connector: ConnectorTrustContent,
  pluginHosts: PluginHosts | undefined,
): TrustRowView {
  if (connector.transport === "integration") return integrationConnectorRow(connector);
  const secrets = secretNames(connector);
  const secretLines = secrets.length === 0 ? [] : [["Gets secrets", secrets.join(", ")] as const];
  if (connector.transport === "plugin")
    return pluginConnectorRow(connector, pluginHosts, secretLines);
  return {
    id: connector.id,
    detail: connector.transport === "http" ? text(connector.settings["url"]) : connector.transport,
    lines: secretLines,
  };
}

/**
 * A local integration's connector: the folder it runs, then the workspace
 * secret each secret of the integration's sheet gets, by name only, as
 * "sync-key and my-notes-key as notes-key" when the names differ (HAL-14734,
 * words from HAL-14737). Joined with "and", as the CLI does: a comma would
 * read as two names for the secret before it (C552). The picks that keep
 * their name come first, as in the CLI, so "as" never reads as a second name
 * either (C569).
 */
function integrationConnectorRow(connector: ConnectorTrustContent): TrustRowView {
  const picks = secretPicks(connector);
  return {
    id: connector.id,
    detail: `integrations/${text(connector.settings["folder"])}`,
    lines: picks.length === 0 ? [] : [["Gets secrets", listed(picks)]],
  };
}

function providerRow(provider: ProviderTrustContent): TrustRowView {
  const destination = keyDestination(provider);
  return {
    id: provider.id,
    detail: provider.baseUrl ?? provider.type,
    lines: [
      ...(provider.secret === undefined
        ? []
        : [["Gets secrets", secretName(provider.secret)] as const]),
      // The key goes somewhere other than its type's own address (HAL-11342).
      ...(destination === undefined || destination.isDefault
        ? []
        : [["Sends its key to", destination.origin] as const]),
    ],
  };
}

/**
 * "Will start 2 programs and 1 agent, pass 3 secrets, list 2 addresses and allow 2 sites." It
 * counts what the check shows: each line under an integration's Reaches is an address (Sofia,
 * HAL-15146). An integration counts as run also where it isn't in the sandbox, since **Trust**
 * there waits for the person's yes to run it without (R12).
 */
function startSummary(content: TrustCheck["content"], runs: IntegrationRuns): string[] {
  const agents = content.agents ?? [];
  const providers = content.providers ?? [];
  const started = [
    programs(content.connectors).length > 0
      ? counted(programs(content.connectors).length, "program")
      : undefined,
    agents.length > 0 ? counted(agents.length, "agent") : undefined,
  ].filter((part) => part !== undefined);
  const integrations = content.integrations ?? [];
  const secrets = new Set([
    ...content.connectors.flatMap(secretNames),
    ...providers.flatMap((provider) =>
      provider.secret === undefined ? [] : [secretName(provider.secret)],
    ),
  ]).size;
  const addressCount =
    addresses(content.connectors).length +
    integrations.reduce((sum, integration) => sum + Object.keys(integration.hosts).length, 0) +
    providers.length;
  const sites = new Set([
    ...agents.flatMap((agent) => agent.allowedSites),
    // A program's sites count where they're shown: in the sandbox, as the CLI counts them.
    ...(runs?.state === "fenced"
      ? programs(content.connectors).flatMap((row) => programTrustFields(row).sites)
      : []),
  ]).size;
  const clauses = [
    started.length > 0 ? `start ${started.join(" and ")}` : undefined,
    integrations.length > 0 ? `run ${counted(integrations.length, "integration")}` : undefined,
    secrets > 0 ? `pass ${counted(secrets, "secret")}` : undefined,
    addressCount > 0 ? `list ${counted(addressCount, "address")}` : undefined,
    sites > 0 ? `allow ${counted(sites, "site")}` : undefined,
  ].filter((part) => part !== undefined);
  return clauses.length === 0
    ? ["Nothing in this workspace starts a program or reaches an address."]
    : [`Will ${listed(clauses)}.`];
}

function counted(count: number, noun: string): string {
  if (count === 1) return `1 ${noun}`;
  const plural = noun.endsWith("ss") || noun.endsWith("dress") ? `${noun}es` : `${noun}s`;
  return `${count} ${plural}`;
}

function isProgram(connector: ConnectorTrustContent): boolean {
  return connector.transport === "stdio";
}

function isAddress(connector: ConnectorTrustContent): boolean {
  return !isProgram(connector);
}

function programs(connectors: readonly ConnectorTrustContent[]): ConnectorTrustContent[] {
  return connectors.filter(isProgram);
}

function addresses(connectors: readonly ConnectorTrustContent[]): ConnectorTrustContent[] {
  return connectors.filter(isAddress);
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}
