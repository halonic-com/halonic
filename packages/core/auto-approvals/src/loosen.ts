// Tighten at once, loosen slowly (design section 4, rule 4). An entry or hold
// added in a revision applies straight away; one removed keeps applying for
// 24 hours after the revision that removed it, so every owner sees the removal
// in a digest before it takes effect.

import type { Hold, NeverList, NeverListEntry } from "./never-list.ts";

/** How long a removed entry or hold keeps applying. */
export const loosenDelayMs = 24 * 60 * 60 * 1000;

/** One revision of the never-list document, as read and checked. */
export interface NeverListRevision {
  /** When Paperclip saved the revision (a fact from its revision history). */
  readonly createdAt: string;
  readonly list: NeverList;
}

/**
 * The never-list in effect at `now`: the latest revision, plus every entry and
 * hold that an earlier revision had and that was removed less than 24 hours ago.
 *
 * @param revisions - every revision of the document, oldest first; at least one
 */
export function effectiveNeverList(revisions: readonly NeverListRevision[], now: Date): NeverList {
  const latest = revisions.at(-1);
  if (latest === undefined) throw new Error("effectiveNeverList needs at least one revision.");
  const stillApplies = (removedAt: number) => now.getTime() < removedAt + loosenDelayMs;
  return {
    ...latest.list,
    entries: withRecentlyRemoved(revisions, (list) => list.entries, entryKey, stillApplies),
    holds: withRecentlyRemoved(revisions, (list) => list.holds, holdKey, stillApplies),
  };
}

/** The latest revision's items, then the removed items that still apply. */
function withRecentlyRemoved<T>(
  revisions: readonly NeverListRevision[],
  itemsOf: (list: NeverList) => readonly T[],
  keyOf: (item: T) => string,
  stillApplies: (removedAt: number) => boolean,
): T[] {
  const lastRemoval = new Map<string, { item: T; at: number }>();
  for (let index = 1; index < revisions.length; index++) {
    const before = itemsOf((revisions[index - 1] as NeverListRevision).list);
    const after = revisions[index] as NeverListRevision;
    const kept = new Set(itemsOf(after.list).map(keyOf));
    for (const item of before) {
      if (!kept.has(keyOf(item)))
        lastRemoval.set(keyOf(item), { item, at: Date.parse(after.createdAt) });
    }
  }
  const latest = itemsOf((revisions.at(-1) as NeverListRevision).list);
  const latestKeys = new Set(latest.map(keyOf));
  const removed = [...lastRemoval.entries()]
    .filter(([key, removal]) => !latestKeys.has(key) && stillApplies(removal.at))
    .map(([, removal]) => removal.item);
  return [...latest, ...removed];
}

function entryKey(entry: NeverListEntry): string {
  return `${entry.kind}\u0000${entry.value}`;
}

function holdKey(hold: Hold): string {
  return `${hold.name}\u0000${hold.covers === "all" ? "all" : [...hold.covers].sort().join(",")}`;
}
