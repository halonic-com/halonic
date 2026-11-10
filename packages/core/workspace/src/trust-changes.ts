import { deepEqual } from "@halonicjs/std";
import type { AgentTrustContent } from "./trust-agents.ts";
import type { ConnectorTrustContent, TrustContent } from "./trust-content.ts";

/** One item, a connector or an agent, whose trust content differs from the trusted one. */
export interface ChangedItem<Content> {
  id: string;
  /** The item as it was trusted. */
  before: Content;
  /** The item as it is now. */
  after: Content;
  /** The fields that differ, such as `settings` or `allowedSites`, sorted. */
  fields: string[];
}

/** One connector whose trust content differs from the trusted one. */
export type ChangedConnector = ChangedItem<ConnectorTrustContent>;

/** One harness agent whose trust content differs from the trusted one. */
export type ChangedAgent = ChangedItem<AgentTrustContent>;

/** What changed in one list of the trust content, matched by id. */
export interface ItemChanges<Content> {
  /** Items that weren't in the trusted content. */
  added: Content[];
  /** Items that are in both, but differ. */
  changed: ChangedItem<Content>[];
  /** Items that were trusted and are gone. */
  removed: Content[];
  /** How many items are the same as when they were trusted. */
  unchanged: number;
}

/**
 * What changed between the trust content a person trusted and the current
 * one, in the order the prompt shows it: New and Changed first. The
 * top-level lists are the connectors; `agents` holds the harness agents.
 */
export interface TrustChanges extends ItemChanges<ConnectorTrustContent> {
  /**
   * The harness agents that changed. An agent that left the content because
   * it went back to Halonic's own harness counts as removed.
   */
  agents: ItemChanges<AgentTrustContent>;
  /**
   * Whether the change only removes whole connectors or harness agents, so
   * the record can shrink without asking (HAL-65 decision 9). A change
   * inside one never counts as a removal, even when it takes something out
   * of the file: dropping a tool from `approve`, dropping the `allow` list,
   * an environment variable or an allowed site can make it do more, or
   * reach somewhere else, so it asks again.
   */
  onlyRemoves: boolean;
}

/**
 * Compares the trust content a person trusted with the current one.
 * Connectors and agents are matched by id. A record from before harness
 * agents existed has no `agents`, which is the same as none.
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
  const connectors = itemChanges(trusted.connectors, current.connectors);
  const agents = itemChanges(trusted.agents ?? [], current.agents ?? []);

  const removesSomething = connectors.removed.length > 0 || agents.removed.length > 0;
  const addsOrChanges = [connectors, agents].some(
    (changes) => changes.added.length > 0 || changes.changed.length > 0,
  );
  return { ...connectors, agents, onlyRemoves: removesSomething && !addsOrChanges };
}

function itemChanges<Content extends { id: string }>(
  trusted: readonly Content[],
  current: readonly Content[],
): ItemChanges<Content> {
  const before = new Map(trusted.map((item) => [item.id, item]));
  const after = new Map(current.map((item) => [item.id, item]));

  const added = current.filter((item) => !before.has(item.id));
  const removed = trusted.filter((item) => !after.has(item.id));
  const changed: ChangedItem<Content>[] = [];
  let unchanged = 0;
  for (const item of current) {
    const old = before.get(item.id);
    if (old === undefined) {
      continue;
    }
    const fields = changedFields(old, item);
    if (fields.length === 0) {
      unchanged += 1;
    } else {
      changed.push({ id: item.id, before: old, after: item, fields });
    }
  }
  return { added, changed, removed, unchanged };
}

/** The top-level fields whose values differ, or that only one side has. */
function changedFields(before: object, after: object): string[] {
  const old = new Map<string, unknown>(Object.entries(before));
  const now = new Map<string, unknown>(Object.entries(after));
  const fields = new Set([...old.keys(), ...now.keys()]);
  return [...fields].filter((field) => !deepEqual(old.get(field), now.get(field))).sort();
}
