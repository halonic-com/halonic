// What changed since a workspace was trusted, as `halonic trust --json`
// gives it (HAL-188 build item 10b). The terminal shows the same changes as
// New, Changed and Removed rows; a script gets the ids and the names of the
// fields that changed. The values stay out: the fingerprint already covers
// them, and the check on stderr shows them to a person.

import type { ItemChanges, TrustChanges } from "@halonicjs/workspace";

/** One list of the changes, by id: what's new, what changed and in which fields, what's gone. */
export interface ItemChangesDocument {
  readonly added: readonly string[];
  readonly changed: readonly { readonly id: string; readonly fields: readonly string[] }[];
  readonly removed: readonly string[];
}

/** The `changes` field of `halonic trust --json` for a workspace that changed since it was trusted. */
export interface TrustChangesDocument {
  /** When the person trusted the earlier version, as ISO text. */
  readonly trustedAt: string;
  readonly connectors: ItemChangesDocument;
  /** The harness agents. */
  readonly agents: ItemChangesDocument;
  /** The local integrations' setting addresses. */
  readonly integrations: ItemChangesDocument;
  /** The model providers. */
  readonly providers: ItemChangesDocument;
}

/**
 * The changes `trustChanges` found, by id, for `--json`.
 *
 * @example
 * trustChangesDocument(check.changes, check.trustedAt).connectors.added; // ["notes"]
 */
export function trustChangesDocument(
  changes: TrustChanges,
  trustedAt: string,
): TrustChangesDocument {
  return {
    trustedAt,
    connectors: itemChangesDocument(changes),
    agents: itemChangesDocument(changes.agents),
    integrations: itemChangesDocument(changes.integrations),
    providers: itemChangesDocument(changes.providers),
  };
}

function itemChangesDocument(changes: ItemChanges<{ readonly id: string }>): ItemChangesDocument {
  return {
    added: changes.added.map((item) => item.id),
    changed: changes.changed.map((item) => ({ id: item.id, fields: item.fields })),
    removed: changes.removed.map((item) => item.id),
  };
}
