// Where the run proposal service keeps its records (HAL-3248): one JSON
// file per run, in a store of its own. Internal to `core/app`.

import type { DefinitionStore } from "@halonicjs/ports";
import { KeyedQueue } from "@halonicjs/std";
import {
  type ProposedRecord,
  parseRunProposalRecord,
  type RunningRecord,
  type RunProposalRecord,
  recordPathOf,
  serializeRunProposalRecord,
} from "./run-proposal-record.ts";

/** A record's file name: a run id (a proposal ref's id) and `.json`. */
const recordFilePattern = /^([A-Za-z0-9_][A-Za-z0-9_-]{0,63})\.json$/u;

/**
 * The records of one workspace's runs, one per run with a worktree or a
 * proposal. Work on one run runs in that run's turn ({@link inTurn}), so
 * an `end` and an Accept, or two Accepts, never interleave.
 */
export class ProposalRecordStore {
  /** The records' own store, holding nothing else; never the workspace's store. */
  readonly store: DefinitionStore;
  private readonly queue = new KeyedQueue();

  constructor(store: DefinitionStore) {
    this.store = store;
  }

  /** Runs `work` after every earlier piece of work on the same run. */
  inTurn<T>(runId: string, work: () => Promise<T>): Promise<T> {
    return this.queue.run(runId, work);
  }

  /**
   * A run's record, or `null` when it has none.
   *
   * @throws RangeError for a run id that can't name a proposal ref
   * @throws when the record can't be read, naming what is wrong with it
   */
  async read(runId: string): Promise<RunProposalRecord | null> {
    const text = await this.store.read(recordPathOf(runId));
    if (text === null) {
      return null;
    }
    const parsed = parseRunProposalRecord(text, runId);
    if (!parsed.ok) {
      throw new Error(`The proposal record of run ${runId} can't be read: ${parsed.error}.`);
    }
    return parsed.value;
  }

  /**
   * A run's proposal, while the person can still decide it.
   *
   * @throws when the run has none, when it is settled, or as {@link read}
   */
  async proposed(runId: string): Promise<ProposedRecord> {
    const record = await this.read(runId);
    if (record?.state !== "proposed") {
      throw new Error(`Run ${runId} has no proposal.`);
    }
    if (record.settled !== undefined) {
      throw new Error(`The proposal of run ${runId} is settled: nothing more can be decided.`);
    }
    return record;
  }

  /** Creates or replaces a run's record. */
  async save(record: RunProposalRecord): Promise<void> {
    const runId = record.state === "running" ? record.runId : record.proposal.runId;
    await this.store.write(recordPathOf(runId), serializeRunProposalRecord(record));
  }

  /** Deletes a run's record. */
  async remove(runId: string): Promise<void> {
    await this.store.remove(recordPathOf(runId));
  }

  /**
   * The runs whose record says they are still running. A record that
   * can't be read is left out: it may hold a proposal's decisions, which
   * must not be thrown away, so it waits for `read` to report it.
   */
  async running(): Promise<string[]> {
    const records = await this.readable();
    return records
      .filter((record): record is RunningRecord => record.state === "running")
      .map(({ runId }) => runId);
  }

  /** The proposals, settled or not. A record that can't be read is left out, as for {@link running}. */
  async proposals(): Promise<ProposedRecord[]> {
    const records = await this.readable();
    return records.filter((record): record is ProposedRecord => record.state === "proposed");
  }

  /** Every record that can be read. */
  private async readable(): Promise<RunProposalRecord[]> {
    const records: RunProposalRecord[] = [];
    for (const path of await this.store.list()) {
      const runId = recordFilePattern.exec(path)?.[1];
      const text = runId === undefined ? null : await this.store.read(path);
      if (runId === undefined || text === null) {
        continue;
      }
      const record = parseRunProposalRecord(text, runId);
      if (record.ok) {
        records.push(record.value);
      }
    }
    return records;
  }
}
