import type { ProposedRecord } from "@halonicjs/app";
import type { RunProposalEntry } from "@halonicjs/studio-feature-inbox/api";
import type { SourcedRun } from "@halonicjs/studio-feature-runs/api";

/**
 * Each proposal with its run's record, or `undefined` when the run's log is gone. The runs are
 * read only when there is a proposal (`studio.workspace-run-proposals`).
 *
 * @param runs - the workspace's runs, read with the workspace's files so an item's name is known
 */
export async function withRunRecords(
  records: readonly ProposedRecord[],
  runs: () => Promise<readonly SourcedRun[]>,
): Promise<readonly RunProposalEntry[]> {
  if (records.length === 0) return [];
  const byId = new Map((await runs()).map(({ summary }) => [summary.id, summary]));
  return records.map((record) => ({ record, run: byId.get(record.proposal.runId) }));
}
