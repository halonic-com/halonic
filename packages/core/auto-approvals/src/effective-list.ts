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
  /**
   * Paperclip's revision number (a server fact): 1, 2, 3 and so on. It orders
   * the revisions, so two written in the same millisecond still have an order.
   */
  readonly revisionNumber: number;
  /** When Paperclip stored this revision (a server fact). */
  readonly writtenAt: Date;
  /**
   * Whether someone with authority over the list (an owner) wrote it, as
   * Paperclip records the author. Any other older revision, such as an agent's
   * edit while the list was unlocked, is ignored for content and for timing.
   */
  readonly ownerWritten: boolean;
}

/** The entries and holds in force now. */
export interface EffectiveNeverList {
  readonly entries: readonly NeverListEntry[];
  readonly holds: readonly Hold[];
}

/** Why the revision history can't be used. Each one stops Studio. */
export type RevisionHistoryReason =
  | "never_list.missing"
  /** Revision numbers that aren't exactly 1 to n, one each. */
  | "never_list.bad_revision_number"
  /** A time that isn't a date, or a later revision dated before an earlier one. */
  | "never_list.bad_revision_time"
  /** The newest revision wasn't written by an owner (A24). */
  | "never_list.not_owner_latest";

/** The never-list in force, or why Studio must stop. */
export type EffectiveNeverListRead =
  | { readonly ok: true; readonly list: EffectiveNeverList }
  | { readonly ok: false; readonly reason: NeverListReason | RevisionHistoryReason };

/**
 * The never-list in force at `clock.now()`. Studio stops on its own when the
 * newest revision isn't an owner's (A24), and when the history itself is
 * broken: revision numbers that aren't exactly 1 to n, or a time that isn't
 * a date. Only owner-written revisions count after that, ordered by revision
 * number. The newest must read cleanly, or the whole list fails closed. An older revision
 * that doesn't read is left out entirely, for content and for timing: each
 * revision stays in force until 24 hours after the next readable one, so a
 * broken revision in between can't speed up a removal.
 *
 * @param revisions - the document's revisions, every author, in any order
 * @param workspaceId - the Paperclip company id Studio is connected to
 * @param clock - the time to judge the 24-hour delay by
 */
export function effectiveNeverList(
  revisions: readonly NeverListRevision[],
  workspaceId: string,
  clock: Clock,
): EffectiveNeverListRead {
  const history = checkHistory(revisions);
  if (!history.ok) return history;
  const byNumber = history.byNumber.filter((revision) => revision.ownerWritten);
  const newest = byNumber.at(-1);
  if (newest === undefined) return { ok: false, reason: "never_list.missing" };
  const newestRead = readNeverList(newest.text, workspaceId);
  if (!newestRead.ok) return newestRead;

  const readable = byNumber.flatMap((revision) => {
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
 * Every revision ordered by number, once the history is sound: numbers
 * exactly 1 to n, so a missing older revision can't let a removal apply early, times real dates that never go back as the numbers go up, and
 * the newest written by an owner.
 */
function checkHistory(
  revisions: readonly NeverListRevision[],
): { ok: true; byNumber: NeverListRevision[] } | { ok: false; reason: RevisionHistoryReason } {
  const byNumber = [...revisions].sort((a, b) => a.revisionNumber - b.revisionNumber);
  const numbers = byNumber.map((revision) => revision.revisionNumber);
  if (!numbers.every((number, index) => number === index + 1)) {
    return { ok: false, reason: "never_list.bad_revision_number" };
  }
  const times = byNumber.map((revision) => revision.writtenAt.getTime());
  const backwards = times.some((time, index) => index > 0 && time < (times[index - 1] ?? time));
  if (times.some(Number.isNaN) || backwards) {
    return { ok: false, reason: "never_list.bad_revision_time" };
  }
  const newest = byNumber.at(-1);
  if (newest !== undefined && !newest.ownerWritten) {
    return { ok: false, reason: "never_list.not_owner_latest" };
  }
  return { ok: true, byNumber };
}

/**
 * The newest revision, and every older one replaced less than
 * {@link loosenDelayMs} ago. A revision dated in the future also counts:
 * taking in more entries can only block more.
 *
 * @param byNumber - readable revisions, oldest first
 */
function inForce<T extends { readonly writtenAt: Date }>(byNumber: readonly T[], now: number): T[] {
  return byNumber.filter((_, index) => {
    const replacedBy = byNumber[index + 1];
    return replacedBy === undefined || now - replacedBy.writtenAt.getTime() < loosenDelayMs;
  });
}

function sameEntry(entry: NeverListEntry): (other: NeverListEntry) => boolean {
  return (other) => other.kind === entry.kind && other.value === entry.value;
}
