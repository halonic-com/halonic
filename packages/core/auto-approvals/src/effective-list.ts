// The never-list Studio actually applies: the board's seed floor, plus every
// entry and hold of the current revision, plus those of any revision that
// stopped being current less than 24 hours ago. So adding applies at once,
// and removing applies only after 24 hours.

import type { Clock } from "@halonicjs/std";
import {
  type Hold,
  type NeverListEntry,
  type NeverListReason,
  readNeverList,
} from "./never-list.ts";

/**
 * The board's seed list (design section 4), built into Studio. Removing an
 * entry from the workspace document never lifts these; removing one here
 * needs a change reviewed by Liam.
 */
export const seedEntries: readonly NeverListEntry[] = [
  { kind: "approval_type", value: "hire_agent" },
  { kind: "approval_type", value: "approve_ceo_strategy" },
  { kind: "approval_type", value: "budget_override_required" },
  { kind: "approval_source", value: "tool_gateway" },
  { kind: "path_class", value: "security" },
  { kind: "path_class", value: "liam_path" },
  { kind: "path_class", value: "release" },
  { kind: "path_class", value: "version_bump" },
  { kind: "keyword", value: "secret" },
];

/** How long a removed entry or hold keeps blocking: 24 hours. */
export const loosenDelayMs = 24 * 60 * 60 * 1000;

/** One revision of the never-list document, as Paperclip's revision history gives it. */
export interface NeverListRevision {
  readonly text: string;
  /** When Paperclip stored this revision (a server fact). */
  readonly writtenAt: Date;
  /**
   * Whether someone with authority over the list (an owner) wrote it, as
   * Paperclip records the author. Any other revision, such as an agent's edit
   * while the list was unlocked, is ignored for content and for timing.
   */
  readonly ownerWritten: boolean;
}

/** The entries and holds in force now. */
export interface EffectiveNeverList {
  readonly entries: readonly NeverListEntry[];
  readonly holds: readonly Hold[];
}

/** The never-list in force, or why Studio must stop. */
export type EffectiveNeverListRead =
  | { readonly ok: true; readonly list: EffectiveNeverList }
  | { readonly ok: false; readonly reason: NeverListReason | "never_list.missing" };

/**
 * The never-list in force at `clock.now()`, from owner-written revisions
 * only. The newest of them must read cleanly, or the whole list fails closed.
 * An older revision that doesn't read is left out entirely, for content and
 * for timing: each revision stays in force until 24 hours after the next
 * readable one, so a broken revision in between can't speed up a removal.
 *
 * @param revisions - the document's revisions, in any order
 * @param workspaceId - the Paperclip company id Studio is connected to
 * @param clock - the time to judge the 24-hour delay by
 */
export function effectiveNeverList(
  revisions: readonly NeverListRevision[],
  workspaceId: string,
  clock: Clock,
): EffectiveNeverListRead {
  const byTime = revisions.filter((revision) => revision.ownerWritten).sort(oldestFirst);
  const newest = byTime.at(-1);
  if (newest === undefined) return { ok: false, reason: "never_list.missing" };
  const newestRead = readNeverList(newest.text, workspaceId);
  if (!newestRead.ok) return newestRead;

  const readable = byTime.flatMap((revision) => {
    const read = revision === newest ? newestRead : readNeverList(revision.text, workspaceId);
    return read.ok ? [{ writtenAt: revision.writtenAt, list: read.list }] : [];
  });
  const entries: NeverListEntry[] = [...seedEntries];
  const holds: Hold[] = [];
  for (const { list } of inForce(readable, clock.now().getTime())) {
    entries.push(...list.entries.filter((entry) => !entries.some(sameEntry(entry))));
    holds.push(...list.holds);
  }
  return { ok: true, list: { entries, holds } };
}

/**
 * Oldest first. Revisions written in the same millisecond are ordered by
 * their text, so the result never depends on the order Paperclip lists them.
 */
function oldestFirst(a: NeverListRevision, b: NeverListRevision): number {
  const byTime = a.writtenAt.getTime() - b.writtenAt.getTime();
  if (byTime !== 0) return byTime;
  if (a.text === b.text) return 0;
  return a.text < b.text ? -1 : 1;
}

/**
 * The newest revision, and every older one replaced less than
 * {@link loosenDelayMs} ago. A revision dated in the future also counts:
 * taking in more entries can only block more.
 *
 * @param byTime - readable revisions, oldest first
 */
function inForce<T extends { readonly writtenAt: Date }>(byTime: readonly T[], now: number): T[] {
  return byTime.filter((_, index) => {
    const replacedBy = byTime[index + 1];
    return replacedBy === undefined || now - replacedBy.writtenAt.getTime() < loosenDelayMs;
  });
}

function sameEntry(entry: NeverListEntry): (other: NeverListEntry) => boolean {
  return (other) => other.kind === entry.kind && other.value === entry.value;
}
