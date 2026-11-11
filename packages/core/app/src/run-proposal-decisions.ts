// What the person decides about a run's proposal (HAL-3248): Accept,
// Reject, Compare, and Undo and Redo of those decisions. Internal to
// `core/app`; `RunProposals` hands its calls here.

import {
  acceptFiles,
  type DecideContext,
  expectedOf,
  refusalOf,
  restoreFile,
} from "./run-proposal-decide.ts";
import {
  type PartlyDecided,
  type ProposedRecord,
  recordPathOf,
  serializeRunProposalRecord,
} from "./run-proposal-record.ts";
import type { ProposalRecordStore } from "./run-proposal-store.ts";
import type { ProposalReader } from "./run-proposal-texts.ts";
import type {
  AcceptResult,
  CompareTexts,
  Decision,
  ProposalTarget,
  ProposedFile,
  RefusalReason,
  RejectResult,
  RestoreResult,
  UndoFileWrite,
  UndoStep,
} from "./run-proposal-types.ts";

/** The decisions on the proposals of one workspace's runs. */
export class ProposalDecisions {
  private readonly records: ProposalRecordStore;
  private readonly context: DecideContext;

  constructor(records: ProposalRecordStore, context: DecideContext) {
    this.records = records;
    this.context = context;
  }

  /** See `RunProposals.accept`. */
  accept(runId: string, target: ProposalTarget): Promise<AcceptResult> {
    return this.records.inTurn(runId, async () => {
      const record = await this.records.proposed(runId);
      const reader = await this.readerOf(record);
      const files = record.proposal.files.filter((file) => covers(target, file));
      const accepted = await acceptFiles(this.context, record, files, reader);
      const decisions = await this.saveDecisions(record, accepted.decisions);
      return {
        undo:
          accepted.writes.length === 0 ? null : stepOf(runId, [...accepted.writes, ...decisions]),
        written: accepted.writes.map((write) => write.path),
        changedOnDisk: accepted.changedOnDisk,
        refused: accepted.refused,
      };
    });
  }

  /** See `RunProposals.reject`. */
  reject(runId: string, target: ProposalTarget): Promise<RejectResult> {
    return this.records.inTurn(runId, async () => {
      const record = await this.records.proposed(runId);
      const decisions: Record<string, Decision> = { ...record.decisions };
      for (const file of record.proposal.files) {
        if (covers(target, file) && decisions[file.path] === "undecided") {
          decisions[file.path] = settledOnReject(file, record.partly?.[file.path]);
        }
      }
      return { undo: stepOf(runId, await this.saveDecisions(record, decisions)) };
    });
  }

  /** See `RunProposals.compare`. */
  async compare(runId: string, path: string): Promise<CompareTexts> {
    const record = await this.records.proposed(runId);
    const reader = await this.readerOf(record);
    const { proposal } = record;
    if (!proposal.files.some((file) => file.path === path)) {
      throw new Error(`Run ${runId} proposes no change to ${path}.`);
    }
    return {
      base: await reader.read("base", path),
      saved: await this.context.store.read(path),
      run: record.partly?.[path]?.run ?? (await reader.read("run", path)),
    };
  }

  /** See `RunProposals.restore`. */
  restore(step: UndoStep, to: "before" | "after"): Promise<RestoreResult> {
    if (step.source.kind !== "run-proposal") {
      return Promise.reject(new Error("Only a run proposal's steps can be restored here."));
    }
    const { runId } = step.source;
    return this.records.inTurn(runId, async () => {
      // The history drops a settled run's steps; one that comes back anyway changes nothing.
      await this.records.proposed(runId);
      const entries = to === "before" ? [...step.files].reverse() : step.files;
      const changedOnDisk: string[] = [];
      const refusedEntries: { path: string; why: RefusalReason }[] = [];
      for (const entry of entries) {
        const outcome = await this.restoreEntry(runId, entry, to);
        if (outcome === "changed-on-disk") {
          changedOnDisk.push(entry.path);
        } else if (outcome !== "restored") {
          refusedEntries.push({ path: entry.path, why: outcome.refused });
        }
      }
      return { changedOnDisk, refused: refusedEntries };
    });
  }

  /** Puts one entry of a run's step back, in the run's turn. */
  private async restoreEntry(
    runId: string,
    entry: UndoFileWrite,
    to: "before" | "after",
  ): Promise<"restored" | "changed-on-disk" | { readonly refused: RefusalReason }> {
    if (entry.path === decisionsPathOf(runId)) {
      // The decisions record is named in the step as Elena's history
      // shows it, but lives in the records' own store.
      const recordContext: DecideContext = { ...this.context, store: this.records.store };
      const recordEntry = { ...entry, path: recordPathOf(runId) };
      return (await restoreFile(recordContext, recordEntry, to)) ? "restored" : "changed-on-disk";
    }
    // A step comes back from the history, which Accept didn't build:
    // trust rule A holds for each of its files as it does for Accept.
    const why = refusalOf(entry.path);
    if (why !== null) {
      return { refused: why };
    }
    return (await restoreFile(this.context, entry, to)) ? "restored" : "changed-on-disk";
  }

  /** @throws ProposalUnavailableError when the proposal's texts are gone */
  readerOf(record: ProposedRecord): Promise<ProposalReader> {
    return this.context.texts.readerOf(record.proposal);
  }

  /**
   * Saves new decisions, and where the partly decided files stand, and
   * gives the decisions record's entry for the undo step; no entry when
   * nothing changed. A file decided as a whole is no longer partly decided.
   */
  async saveDecisions(
    record: ProposedRecord,
    decisions: Readonly<Record<string, Decision>>,
    partly: Readonly<Record<string, PartlyDecided>> = record.partly ?? {},
  ): Promise<UndoStep["files"]> {
    const after = withPartly({ ...record, decisions }, partly);
    const beforeText = serializeRunProposalRecord(record);
    const afterText = serializeRunProposalRecord(after);
    if (beforeText === afterText) {
      return [];
    }
    await this.records.save(after);
    return [{ path: decisionsPathOf(record.proposal.runId), before: beforeText, after: afterText }];
  }
}

/**
 * The name an undo step gives a run's decisions record, as agreed with
 * Elena (HAL-4121). The record itself is in the records' own store.
 */
export function decisionsPathOf(runId: string): string {
  return `.halonic/proposals/${runId}.json`;
}

/**
 * How Reject settles an undecided file, as a whole or with its last part:
 * accepted if the person accepted any part of it, which the saved file then
 * holds instead of the run's base; rejected if not.
 */
export function settledOnReject(
  file: ProposedFile,
  partly: PartlyDecided | undefined,
): "accepted" | "rejected" {
  return partly !== undefined && partly.saved !== expectedOf(file) ? "accepted" : "rejected";
}

/** The record with `partly` kept for its undecided files only, and left out when none are. */
function withPartly(
  record: ProposedRecord,
  partly: Readonly<Record<string, PartlyDecided>>,
): ProposedRecord {
  const { partly: _old, ...rest } = record;
  const kept = Object.entries(partly).filter(([path]) => record.decisions[path] === "undecided");
  return kept.length === 0 ? rest : { ...rest, partly: Object.fromEntries(kept) };
}

/** Whether the target covers a file. */
function covers(target: ProposalTarget, file: ProposedFile): boolean {
  return target === "all" || target.file === file.path;
}

/** An undo step of a run's proposal. */
export function stepOf(runId: string, files: UndoStep["files"]): UndoStep {
  return { source: { kind: "run-proposal", runId }, files };
}
