// Run proposals in Needs you (flow-inbox 2.2, HAL-10916): a run that changed
// workspace files proposes them, and the Inbox lists one item per run until
// nothing is left to decide. The rules are HAL-1305's of 11 Nov and rows Q1,
// Q2 and Q8 of HAL-11945.

import { isProposalFinished, type ProposedRecord } from "@halonicjs/app";
import type { RunSummary } from "@halonicjs/events";

/**
 * How the run that proposed ended, read from its run record and never from the proposal (Q2):
 * `finished` when it completed, `stopped` for a cancel or a budget stop, `failed` for the rest.
 */
export type ProposalEnding = "finished" | "failed" | "stopped";

/** The changes one run proposes, one item per run however many items it changed (Q1). */
export interface ProposalItem {
  readonly kind: "proposal";
  /** `proposal:<runId>`. */
  readonly key: string;
  readonly runId: string;
  /** Every file the run changed, those that can't be written too (Q8): "proposes 3 changes". */
  readonly changes: number;
  /** The ids of the items the files belong to, in path order, each once. */
  readonly items: readonly string[];
  /** The items' names as their files say, in the same order; an id when the file can't be read. */
  readonly itemNames: readonly string[];
  /** `null` when the run's record can't be read: the row then says only when it ended. */
  readonly ending: ProposalEnding | null;
  /** ISO time the run ended: from its record, else when the proposal was made. Newest first. */
  readonly since: string;
}

/**
 * The open proposals of these records, newest first. A proposal is open until it is settled or
 * nothing in it is left to decide (Q8); one where no file can be written stays open, so it still
 * gets its item.
 *
 * @param runOf the run's record, for how it ended (Q2); `undefined` when it can't be read
 * @param nameOfItem an item's name as its file says; its id when the file can't be read
 *
 * @example
 * proposalItems(await proposals.list(), (id) => runs.get(id), (id) => names.get(id) ?? id);
 */
export function proposalItems(
  records: readonly ProposedRecord[],
  runOf: (runId: string) => RunSummary | undefined,
  nameOfItem: (itemId: string) => string = (id) => id,
): ProposalItem[] {
  return records
    .filter(isOpen)
    .map((record) => proposalItem(record, runOf(record.proposal.runId), nameOfItem))
    .sort(newestFirst);
}

function isOpen(record: ProposedRecord): boolean {
  if (record.settled !== undefined) return false;
  const decisions = Object.values(record.decisions);
  return (
    !isProposalFinished(record) || decisions.every((decision) => decision === "not-applicable")
  );
}

function proposalItem(
  record: ProposedRecord,
  run: RunSummary | undefined,
  nameOfItem: (itemId: string) => string,
): ProposalItem {
  const { runId, files, items } = record.proposal;
  return {
    kind: "proposal",
    key: `proposal:${runId}`,
    runId,
    changes: files.length,
    items,
    itemNames: items.map(nameOfItem),
    ending: run === undefined ? null : endingOf(run),
    since: run?.endedAt ?? record.finishedAt,
  };
}

function endingOf(run: RunSummary): ProposalEnding | null {
  if (run.status === "completed") return "finished";
  if (run.status !== "failed") return null;
  return run.reason === "cancelled" || run.reason === "budget" ? "stopped" : "failed";
}

function newestFirst(a: ProposalItem, b: ProposalItem): number {
  if (a.since !== b.since) return a.since < b.since ? 1 : -1;
  // A plain comparison, so the order doesn't depend on the locale.
  if (a.key === b.key) return 0;
  return a.key < b.key ? -1 : 1;
}
