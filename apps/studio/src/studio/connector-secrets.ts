import type { ConnectorTrustContent } from "@halonicjs/workspace";
import { listed } from "./listed.ts";

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
 * sorted by the sheet's name. A connector's own `secret` keeps its name. One
 * entry per workspace secret, with every sheet name it's given as in brackets
 * (C571); the ones that keep their name come first, then the renamed ones,
 * each group in its order: "sync-key, backup (as api-key) and my-notes-key
 * (as notes-key)" (C569).
 */
export function secretPicks(connector: ConnectorTrustContent): string[] {
  const own = namesOf([connector.secret]).map((name) => ({ secret: name, as: name }));
  const picks = Object.entries(record(connector.settings["secrets"]))
    .sort(([first], [second]) => first.localeCompare(second, "en"))
    .flatMap(([as, reference]) => namesOf([reference]).map((secret) => ({ secret, as })));
  const sheetNames = new Map<string, Set<string>>();
  for (const { secret, as } of [...own, ...picks]) {
    sheetNames.set(secret, (sheetNames.get(secret) ?? new Set<string>()).add(as));
  }
  const kept: string[] = [];
  const renamed: string[] = [];
  for (const [secret, names] of sheetNames) {
    if ([...names].every((name) => name === secret)) kept.push(secret);
    else renamed.push(`${secret} (as ${listed([...names])})`);
  }
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
