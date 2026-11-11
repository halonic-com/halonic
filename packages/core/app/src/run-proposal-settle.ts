// Settling a run's proposal (HAL-3248, `app.run-proposal-done`): once the
// person decided every file and can no longer undo, or 30 days after the
// run finished, the proposal's ref goes and its record stays, so the Inbox
// can still show what was decided. A proposal whose ref was deleted outside
// Halonic is unavailable, and the person removes it (`app.run-proposal-unavailable`).
// Internal to `core/app`; `RunProposals` hands its calls here.

import type { Clock } from "@halonicjs/ports";
import type { ProposedRecord, Settled } from "./run-proposal-record.ts";
import type { ProposalRecordStore } from "./run-proposal-store.ts";
import type { ProposalTexts } from "./run-proposal-texts.ts";

/** How long a proposal stays open when nobody decides it. */
const openFor = 30 * 24 * 60 * 60 * 1000;

/** What {@link ProposalSettling.settle} did. */
export type SettleResult =
  /** The proposal is settled, now or before: drop the run's undo steps. */
  | "settled"
  /** A file can still be decided, after an Undo say: the proposal stays open. */
  | "open";

/**
 * Whether the person has nothing left to decide in a proposal (Elena's
 * CHECK 5 on HAL-4802): no file is undecided. A file that may never be
 * written counts in the total but is never decided, so it doesn't keep the
 * proposal open.
 */
export function isProposalFinished(record: ProposedRecord): boolean {
  return Object.values(record.decisions).every((decision) => decision !== "undecided");
}

/** Settles the proposals of one workspace's runs. */
export class ProposalSettling {
  private readonly records: ProposalRecordStore;
  private readonly texts: ProposalTexts;
  private readonly clock: Clock;

  constructor(records: ProposalRecordStore, texts: ProposalTexts, clock: Clock) {
    this.records = records;
    this.texts = texts;
    this.clock = clock;
  }

  /** See `RunProposals.settle`. */
  settle(runId: string): Promise<SettleResult> {
    return this.records.inTurn(runId, async () => {
      const record = await this.records.read(runId);
      if (record?.state !== "proposed") {
        throw new Error(`Run ${runId} has no proposal.`);
      }
      if (record.settled !== undefined) {
        return "settled";
      }
      if (!isProposalFinished(record)) {
        return "open";
      }
      await this.settleRecord(record, "decided");
      return "settled";
    });
  }

  /** See `RunProposals.isUnavailable`. */
  isUnavailable(runId: string): Promise<boolean> {
    return this.records.inTurn(runId, async () => {
      const record = await this.records.read(runId);
      if (record?.state !== "proposed") {
        throw new Error(`Run ${runId} has no proposal.`);
      }
      if (record.settled !== undefined) {
        // A settled proposal's ref is gone by design: the Inbox shows its decisions, not its texts.
        return false;
      }
      return !(await this.texts.isAvailable(record.proposal));
    });
  }

  /** See `RunProposals.removeUnavailable`. */
  removeUnavailable(runId: string): Promise<void> {
    return this.records.inTurn(runId, async () => {
      const record = await this.records.proposed(runId);
      if (await this.texts.isAvailable(record.proposal)) {
        // Only a proposal nobody can decide any more goes without a decision; Reject is for the rest.
        throw new Error(`The proposal of run ${runId} is still available.`);
      }
      await this.records.save({
        ...record,
        settled: { at: this.clock.now().toISOString(), why: "unavailable" },
      });
    });
  }

  /** See `RunProposals.settleExpired`. */
  async settleExpired(): Promise<string[]> {
    const settledNow: string[] = [];
    for (const { proposal } of await this.records.proposals()) {
      const { runId } = proposal;
      const settled = await this.records.inTurn(runId, () => this.settleIfDue(runId));
      if (settled) {
        settledNow.push(runId);
      }
    }
    return settledNow;
  }

  /**
   * Settles a proposal older than 30 days, and deletes the ref of a
   * settled one that still has it, after a crash between the two steps.
   *
   * @returns whether the proposal was settled now
   */
  private async settleIfDue(runId: string): Promise<boolean> {
    // Read again in the run's turn: a decision may have come in since the list.
    const record = await this.records.read(runId);
    if (record?.state !== "proposed") {
      return false;
    }
    if (record.settled !== undefined) {
      await this.texts.release(record.proposal);
      return false;
    }
    const age = this.clock.now().getTime() - Date.parse(record.finishedAt);
    if (age < openFor) {
      return false;
    }
    await this.settleRecord(record, "expired");
    return true;
  }

  /**
   * Saves the record as settled, then deletes the ref. In that order, a
   * crash between them leaves a ref that {@link settleExpired} deletes,
   * never an open proposal without its ref.
   */
  private async settleRecord(record: ProposedRecord, why: Settled["why"]): Promise<void> {
    await this.records.save({ ...record, settled: { at: this.clock.now().toISOString(), why } });
    await this.texts.release(record.proposal);
  }
}
