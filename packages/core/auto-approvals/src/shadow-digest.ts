// The daily shadow digest (design section 10, threat model G4). Built from
// the ledger, so a restart loses nothing, plus the source's call counts and
// the pinned documents' revisions. It holds ids, reason codes, hashes and
// counts only: never a payload, a comment or any other text an agent wrote.

import type { LedgerEntry } from "./ledger-entry.ts";
import type { DocumentRevision, PinnedDocument } from "./pinned-documents.ts";
import { pollRan, runEntryId, runStarted } from "./shadow-runner.ts";
import type { ShadowCallCounts } from "./shadow-source.ts";

/** What one day's digest is made from. */
export interface ShadowDigestInput {
  /** The UTC day, such as `2026-11-27`. */
  readonly day: string;
  /** The whole ledger, oldest first; only the day's entries are counted. */
  readonly entries: readonly LedgerEntry[];
  readonly calls: ShadowCallCounts;
  /** Both pinned documents as last read, for the day's revisions. */
  readonly documents?: { readonly neverList: PinnedDocument; readonly stop: PinnedDocument };
  /** The build commit the runner runs. */
  readonly build: string;
  /** The red-team result for this build, or `undefined` when it wasn't run. */
  readonly redTeam?: { readonly passed: number; readonly total: number };
  /** Where the day ends for stopped time: the end of the day, or now while it lasts. */
  readonly until: Date;
}

/** Said instead of 0 for every count that needs a rule (Julian, HAL-19463 A46). */
export const notMeasured = "not measured: no rules in v1";

const dayMs = 24 * 60 * 60 * 1000;

/** Reasons that mean the never-list, a seed entry or a path class blocked the approval. */
const neverListed = new Set([
  "never_list.entry",
  "never_list.hold",
  "never_list.keyword",
  "card.tool_gateway",
  "card.path_class",
]);

/**
 * The digest's text. Every count has its denominator, and stopped time is
 * shown and left out of them: nothing is evaluated while stopped.
 */
export function shadowDigest(input: ShadowDigestInput): string {
  const start = Date.parse(`${input.day}T00:00:00.000Z`);
  const end = Math.min(start + dayMs, input.until.getTime());
  const today = input.entries.filter((entry) => sameDay(entry.at, start));
  const runEntries = today.filter((entry) => entry.approvalId === runEntryId);
  const reasons = latestReasonPerApproval(today);
  const seen = reasons.size;
  const counted = (test: (reason: string) => boolean) =>
    `${[...reasons.values()].filter(test).length} of ${seen}`;
  const stops = runEntries.filter((entry) => isStop(entry.reason));
  const head = input.entries.at(-1)?.hash ?? "none";

  return [
    `Auto approvals shadow digest, ${input.day} (UTC)`,
    `Build: ${input.build}`,
    `Ledger head: ${head}`,
    redTeamLine(input),
    `Stopped: ${duration(stoppedMs(runEntries, end))} of ${duration(end - start)}, left out of every count below`,
    `Polls: ${runEntries.filter((entry) => entry.reason === pollRan).length + stops.length}, stopped: ${stops.length}, restarts: ${runEntries.filter((entry) => entry.reason === runStarted).length}`,
    ...tally(stops.map((entry) => entry.reason)).map(
      ([reason, count]) => `- stopped by ${reason}: ${count}`,
    ),
    `Calls to Paperclip: ${input.calls.sent} sent (only GETs can pass the guard), writes sent: 0, refused: ${input.calls.refused} (${input.calls.refusedNotGet} of them writes)`,
    "",
    "Kind untyped:",
    `- approvals seen: ${seen}, evaluations: ${today.length - runEntries.length}`,
    `- untyped: ${counted((reason) => reason.startsWith("card.untyped"))}`,
    `- requester mismatch: ${counted((reason) => reason.includes(":requester_mismatch"))}${idsWith(reasons, ":requester_mismatch")}`,
    `- never-listed: ${counted((reason) => neverListed.has(reason))}`,
    `- near misses: ${notMeasured}`,
    `- a rule would have approved what a person denied: ${notMeasured}`,
    `- agreement with people: ${notMeasured}`,
    "",
    `Reasons (each approval's latest today, of ${seen}):`,
    ...tally([...reasons.values()]).map(([reason, count]) => `- ${reason}: ${count} of ${seen}`),
    "",
    ...revisionLines("never-list", input.documents?.neverList, start),
    ...revisionLines("stop document", input.documents?.stop, start),
  ].join("\n");
}

/** The approval ids whose reason holds `marker`, after a colon, or nothing when there are none. */
function idsWith(reasons: ReadonlyMap<string, string>, marker: string): string {
  const ids = [...reasons].filter(([, reason]) => reason.includes(marker)).map(([id]) => id);
  return ids.length === 0 ? "" : `: ${ids.join(", ")}`;
}

function redTeamLine(input: ShadowDigestInput): string {
  const { redTeam } = input;
  if (redTeam === undefined) return `Red-team: not run on build ${input.build}`;
  return `Red-team: ${redTeam.passed} of ${redTeam.total} passed on build ${input.build}`;
}

function sameDay(at: string, start: number): boolean {
  const time = Date.parse(at);
  return time >= start && time < start + dayMs;
}

function isStop(reason: string): boolean {
  return reason !== pollRan && reason !== runStarted;
}

/** Each approval's latest reason, in the order the approvals were first seen. */
function latestReasonPerApproval(entries: readonly LedgerEntry[]): Map<string, string> {
  const reasons = new Map<string, string>();
  for (const entry of entries) {
    if (entry.approvalId !== runEntryId) reasons.set(entry.approvalId, entry.reason);
  }
  return reasons;
}

/** From each stop to the next run entry (or the end of the window). */
function stoppedMs(runEntries: readonly LedgerEntry[], end: number): number {
  return runEntries.reduce((total, entry, index) => {
    if (!isStop(entry.reason)) return total;
    const next = runEntries[index + 1];
    return total + (next === undefined ? end : Date.parse(next.at)) - Date.parse(entry.at);
  }, 0);
}

/** `[value, count]` pairs, the most frequent first, then by value. */
function tally(values: readonly string[]): [string, number][] {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts].sort(([a, countA], [b, countB]) => countB - countA || a.localeCompare(b));
}

/** The day's revisions of one document, with time and author, so an owner spots an edit they didn't make. */
function revisionLines(
  name: string,
  document: PinnedDocument | undefined,
  start: number,
): string[] {
  if (document === undefined) return [`${name} revisions today: not read`];
  const today = document.revisions
    .filter((revision) => sameDay(revision.createdAt, start))
    .sort((a, b) => a.revisionNumber - b.revisionNumber);
  if (today.length === 0) return [`${name} revisions today: none`];
  return [`${name} revisions today:`, ...today.map(revisionLine)];
}

function revisionLine(revision: DocumentRevision): string {
  const time = revision.createdAt.slice(11, 16);
  const author =
    revision.authorAgentId === null
      ? `user ${revision.authorUserId ?? "unknown"}`
      : `agent ${revision.authorAgentId}`;
  return `- r${revision.revisionNumber} at ${time} UTC by ${author}`;
}

function duration(ms: number): string {
  const minutes = Math.max(0, Math.round(ms / 60_000));
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}
