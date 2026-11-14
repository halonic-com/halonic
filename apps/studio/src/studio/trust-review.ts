import { programName, type TrustCheck } from "@halonicjs/app";
import { defaultWorkingFolder } from "@halonicjs/format";
import type {
  TrustReview,
  TrustRowView,
  TrustSectionView,
} from "@halonicjs/studio-feature-workspace";
import type {
  AgentTrustContent,
  ChangedAgent,
  ConnectorTrustContent,
  IntegrationTrustContent,
  ProviderTrustContent,
  TrustChanges,
} from "@halonicjs/workspace";

/** What the check doesn't hold, because only the host knows it. */
export interface TrustReviewFacts {
  /** The workspace's name, such as "Acme". */
  readonly name: string;
  /** Its folder, such as "/work/acme". */
  readonly folder: string;
}

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
      ...changesView(check.changes, since, unpinned),
    };
  }
  const { connectors, agents = [], integrations = [], providers = [] } = check.content;
  return {
    ...common,
    title: `Trust ${facts.name}?`,
    changed: false,
    summary: startSummary(check.content),
    sections: sectionsOf(
      [...programs(connectors).map((row) => programRow(row, unpinned))],
      agents.map(agentRow),
      [
        ...addresses(connectors).map((row) => addressRow(row)),
        ...integrations.flatMap((row) => integrationRows(row)),
        ...providers.map(providerRow),
      ],
    ),
  };
}

function changesView(
  changes: TrustChanges,
  since: string,
  unpinned: ReadonlySet<string>,
): Pick<TrustReview, "summary" | "sections" | "unchanged"> {
  const kind = (isKind: (row: ConnectorTrustContent) => boolean) => ({
    added: changes.added.filter(isKind).length,
    changed: changes.changed.filter((row) => isKind(row.after)).length,
  });
  const connectorAddresses = kind((row) => !isProgram(row));
  const counts = [
    ["program", kind(isProgram)],
    ["agent", { added: changes.agents.added.length, changed: changes.agents.changed.length }],
    [
      "address",
      {
        added:
          connectorAddresses.added +
          changes.integrations.added.length +
          changes.providers.added.length,
        changed:
          connectorAddresses.changed +
          changes.integrations.changed.length +
          changes.providers.changed.length,
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
          pick(changes.added, isProgram).map((row) => programRow(row, unpinned)),
          "New",
        ),
        ...tagged(
          pick(changedConnectors, isProgram).map((row) => programRow(row, unpinned)),
          "Changed",
        ),
      ],
      [
        ...tagged(changes.agents.added.map(agentRow), "New"),
        ...tagged(changes.agents.changed.flatMap(agentChangeRows), "Changed"),
      ],
      [
        ...tagged(pick(changes.added, isAddress).map(addressRow), "New"),
        ...tagged(pick(changedConnectors, isAddress).map(addressRow), "Changed"),
        ...tagged(changes.integrations.added.flatMap(integrationRows), "New"),
        ...tagged(
          changes.integrations.changed.flatMap((row) => integrationRows(row.after)),
          "Changed",
        ),
        ...tagged(changes.providers.added.map(providerRow), "New"),
        ...tagged(
          changes.providers.changed.map((row) => providerRow(row.after)),
          "Changed",
        ),
      ],
      true,
    ),
    unchanged:
      unchanged > 0 ? `Unchanged (${unchanged} ${unchanged === 1 ? "item" : "items"})` : undefined,
  };
}

function sectionsOf(
  programRows: readonly TrustRowView[],
  agentRows: readonly TrustRowView[],
  addressRows: readonly TrustRowView[],
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
      heading: heading("Agents", agentRows),
      intro: "Agents in this workspace that run in Claude Code or Codex.",
      rows: agentRows,
      open: changed,
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

function programRow(connector: ConnectorTrustContent, unpinned: ReadonlySet<string>): TrustRowView {
  const command = text(connector.settings["command"]);
  const words = [command, ...strings(connector.settings["args"])];
  const secrets = secretNames(connector);
  const inherited = strings(connector.settings["inheritEnv"]);
  return {
    id: connector.id,
    detail: words.join(" "),
    lines: [
      ...(secrets.length === 0 ? [] : [["Gets secrets", secrets.join(", ")] as const]),
      ...(inherited.length === 0
        ? []
        : [["Takes from your environment", inherited.join(", ")] as const]),
    ],
    warning: unpinned.has(connector.id)
      ? `Can download new code from ${registryOf(command, words)} when it starts: version not pinned.`
      : undefined,
  };
}

function addressRow(connector: ConnectorTrustContent): TrustRowView {
  const secrets = secretNames(connector);
  return {
    id: connector.id,
    detail: connector.transport === "http" ? text(connector.settings["url"]) : connector.transport,
    lines: secrets.length === 0 ? [] : [["Gets secrets", secrets.join(", ")]],
  };
}

function providerRow(provider: ProviderTrustContent): TrustRowView {
  return {
    id: provider.id,
    detail: provider.baseUrl ?? provider.type,
    lines: provider.secret === undefined ? [] : [["Gets secrets", secretName(provider.secret)]],
  };
}

function integrationRows(integration: IntegrationTrustContent): TrustRowView[] {
  const settings = Object.entries(integration.addresses);
  return [
    {
      id: integration.id,
      detail: settings.length === 0 ? "no address set" : "",
      lines: settings.map(([name, address]) => [name, settingAddress(address)] as const),
    },
  ];
}

function settingAddress(address: string | null): string {
  if (address === null) return "not set";
  const refused = /^‹refused: (.+)›$/u.exec(address)?.[1];
  return refused === undefined ? address : `can't be used: ${refused}`;
}

const harnessNames = new Map([
  ["claude-code", "Claude Code"],
  ["codex", "Codex"],
]);

function harnessName(harness: string): string {
  return harnessNames.get(harness) ?? harness;
}

function agentRow(agent: AgentTrustContent): TrustRowView {
  return {
    id: agent.id,
    detail: harnessName(agent.harness),
    lines: [
      ...agent.allowedSites.map(
        (site, index) => [index === 0 ? "Allowed sites" : "", shownSite(site)] as const,
      ),
      ...(agent.workingFolder === undefined
        ? []
        : [["Working folder", agent.workingFolder] as const]),
    ],
  };
}

/** One Changed row per agent, saying what is different. */
function agentChangeRows(agent: ChangedAgent): TrustRowView[] {
  const { before, after } = agent;
  const lines: (readonly [string, string])[] = [];
  if (before.harness !== after.harness) {
    lines.push(["Program", `${harnessName(before.harness)} → ${harnessName(after.harness)}`]);
  }
  const added = after.allowedSites.filter((site) => !before.allowedSites.includes(site));
  const removed = before.allowedSites.filter((site) => !after.allowedSites.includes(site));
  if (added.length > 0) lines.push(["Now also allows", added.join(", ")]);
  if (removed.length > 0) lines.push(["No longer allows", removed.join(", ")]);
  const folder = (content: AgentTrustContent) =>
    content.workingFolder ?? defaultWorkingFolder(content.id);
  if (folder(before) !== folder(after)) {
    lines.push(["Working folder", `${folder(before)} → ${folder(after)}`]);
  }
  return [{ id: agent.id, detail: harnessName(after.harness), lines }];
}

/** A site in its stored form, with its note: a wildcard names its domain, Punycode is flagged. */
function shownSite(site: string): string {
  const notes = [
    ...(site.startsWith("*.") ? [`every site under ${site.slice(2)}`] : []),
    ...(site.split(".").some((label) => label.startsWith("xn--")) ? ["(non-Latin letters)"] : []),
  ];
  return [site, ...notes].join(" · ");
}

/** "Will start 2 programs and 1 agent, pass 3 secrets, list 2 addresses and allow 2 sites." */
function startSummary(content: TrustCheck["content"]): string[] {
  const agents = content.agents ?? [];
  const providers = content.providers ?? [];
  const started = [
    programs(content.connectors).length > 0
      ? counted(programs(content.connectors).length, "program")
      : undefined,
    agents.length > 0 ? counted(agents.length, "agent") : undefined,
  ].filter((part) => part !== undefined);
  const secrets = new Set([
    ...content.connectors.flatMap(secretNames),
    ...providers.flatMap((provider) =>
      provider.secret === undefined ? [] : [secretName(provider.secret)],
    ),
  ]).size;
  const addressCount =
    addresses(content.connectors).length +
    (content.integrations ?? []).reduce(
      (sum, integration) => sum + Object.keys(integration.addresses).length,
      0,
    ) +
    providers.length;
  const sites = new Set(agents.flatMap((agent) => agent.allowedSites)).size;
  const clauses = [
    started.length > 0 ? `start ${started.join(" and ")}` : undefined,
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

/** "A", "A and B", "A, B and C". */
function listed(names: readonly string[]): string {
  const last = names.at(-1) ?? "";
  return names.length < 2 ? last : `${names.slice(0, -1).join(", ")} and ${last}`;
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

function secretName(reference: string): string {
  return /^‹secret (.+)›$/u.exec(reference)?.[1] ?? reference;
}

function secretNames(connector: ConnectorTrustContent): string[] {
  const references = [connector.secret, ...Object.values(record(connector.settings["secretEnv"]))];
  const names = references
    .filter((value) => typeof value === "string")
    .map((reference) => /^‹secret (.+)›$/u.exec(reference)?.[1])
    .filter((name) => name !== undefined);
  return [...new Set(names)].sort();
}

/** PyPI for `uvx`, `uv tool run` and `pipx run`; npm for every other package runner. */
function registryOf(command: string, words: readonly string[]): "npm" | "PyPI" {
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
