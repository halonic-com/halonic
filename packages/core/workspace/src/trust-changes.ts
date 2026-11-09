import { deepEqual } from "@halonicjs/std";
import type { ConnectorTrustContent, TrustContent } from "./trust-content.ts";

/** One connector whose trust content differs from the trusted one. */
export interface ChangedConnector {
  id: string;
  /** The connector as it was trusted. */
  before: ConnectorTrustContent;
  /** The connector as it is now. */
  after: ConnectorTrustContent;
  /** The fields that differ, such as `settings` or `tools`, sorted. */
  fields: string[];
}

/**
 * What changed between the trust content a person trusted and the current
 * one, in the order the prompt shows it: New and Changed first.
 */
export interface TrustChanges {
  /** Connectors that weren't in the trusted content. */
  added: ConnectorTrustContent[];
  /** Connectors that are in both, but differ. */
  changed: ChangedConnector[];
  /** Connectors that were trusted and are gone. */
  removed: ConnectorTrustContent[];
  /** How many connectors are the same as when they were trusted. */
  unchanged: number;
  /**
   * Whether the change only removes whole connectors, so the record can
   * shrink without asking (HAL-65 decision 9). A change inside a connector
   * never counts as a removal, even when it takes something out of the
   * file: dropping a tool from `approve`, dropping the `allow` list or an
   * environment variable can make the connector do more, so it asks again.
   */
  onlyRemoves: boolean;
}

/**
 * Compares the trust content a person trusted with the current one.
 * Connectors are matched by id.
 *
 * @param trusted - the content kept in the trust record
 * @param current - the content built from the workspace now
 *
 * @example
 * const changes = trustChanges(trusted, current);
 * if (changes.onlyRemoves) {
 *   // shrink the record without asking
 * }
 */
export function trustChanges(trusted: TrustContent, current: TrustContent): TrustChanges {
  const before = new Map(trusted.connectors.map((connector) => [connector.id, connector]));
  const after = new Map(current.connectors.map((connector) => [connector.id, connector]));

  const added = current.connectors.filter((connector) => !before.has(connector.id));
  const removed = trusted.connectors.filter((connector) => !after.has(connector.id));
  const changed: ChangedConnector[] = [];
  let unchanged = 0;
  for (const connector of current.connectors) {
    const old = before.get(connector.id);
    if (old === undefined) {
      continue;
    }
    const fields = changedFields(old, connector);
    if (fields.length === 0) {
      unchanged += 1;
    } else {
      changed.push({ id: connector.id, before: old, after: connector, fields });
    }
  }

  const onlyRemoves = removed.length > 0 && added.length === 0 && changed.length === 0;
  return { added, changed, removed, unchanged, onlyRemoves };
}

/** The top-level fields whose values differ, or that only one side has. */
function changedFields(before: ConnectorTrustContent, after: ConnectorTrustContent): string[] {
  const old = new Map<string, unknown>(Object.entries(before));
  const now = new Map<string, unknown>(Object.entries(after));
  const fields = new Set([...old.keys(), ...now.keys()]);
  return [...fields].filter((field) => !deepEqual(old.get(field), now.get(field))).sort();
}
