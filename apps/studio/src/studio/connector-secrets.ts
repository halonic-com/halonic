import type { ConnectorTrustContent } from "@halonicjs/workspace";

/** The secrets a connector gets, by name: its own, its program's and its integration's picks. */
export function secretNames(connector: ConnectorTrustContent): string[] {
  const references = [
    connector.secret,
    ...Object.values(record(connector.settings["secretEnv"])),
    ...(connector.transport === "integration"
      ? Object.values(record(connector.settings["secrets"]))
      : []),
  ];
  return [...new Set(namesOf(references))].sort();
}

/**
 * The workspace secret each secret of a local integration's sheet gets,
 * sorted by the sheet's name. A connector's own `secret` keeps its name. The
 * picks that keep their name come first, then the renamed ones, each group in
 * its order: "sync-key, backup as api-key and my-notes-key as notes-key" (C569).
 */
export function secretPicks(connector: ConnectorTrustContent): string[] {
  const own = namesOf([connector.secret]).map((name) => ({ secret: name, as: name }));
  const picks = Object.entries(record(connector.settings["secrets"]))
    .sort(([first], [second]) => first.localeCompare(second, "en"))
    .flatMap(([as, reference]) => namesOf([reference]).map((secret) => ({ secret, as })));
  const all = [...own, ...picks];
  const kept = all.filter(({ secret, as }) => secret === as).map(({ secret }) => secret);
  const renamed = all
    .filter(({ secret, as }) => secret !== as)
    .map(({ secret, as }) => `${secret} as ${as}`);
  return [...kept, ...renamed];
}

/** The names in `‹secret NAME›` references, in their order. */
function namesOf(references: readonly unknown[]): string[] {
  return references
    .filter((value) => typeof value === "string")
    .map((reference) => /^‹secret (.+)›$/u.exec(reference)?.[1])
    .filter((name) => name !== undefined);
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}
