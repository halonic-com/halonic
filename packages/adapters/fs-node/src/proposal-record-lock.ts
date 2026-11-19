// The lock that keeps two processes from deciding one run's proposal at the
// same time (`app.run-proposal-record-lock`, HAL-6477): `halonic proposals`
// and the engine of `halonic routines watch` open the same records, and a
// decision reads the record and writes it back, so without it one decision
// could write over the other's. One lock file per run, `<run-id>.lock`
// beside the records, held with `holdLock` (`fs-node.held-lock`): it is
// renewed while it is held, so a decision that waits for git to start
// doesn't lose it, and the lock of a process that crashed is taken over.

import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { type HeldLock, holdLock, LockHeldError } from "./held-lock.ts";

/**
 * Runs `work` while holding the lock of run `runId`. The same shape as the
 * proposal service's `ProposalRecordLock` in `@halonicjs/app`, which an
 * adapter doesn't depend on.
 */
export type RecordLock = <T>(runId: string, work: () => Promise<T>) => Promise<T>;

/** How long to wait before trying again to take a lock another process holds. */
const retryDelayMs = 25;

/** How long a decision waits for another process's decision on the same run before it gives up. */
const recordLockWaitMs = 30_000;

/**
 * The record lock of the records in `folder`: waits while another process
 * holds a run's lock, then holds it until `work` has settled.
 *
 * @param waitMs - how long to wait for another process's lock; tests shorten it
 * @throws LockHeldError when another process still holds the lock after `waitMs`
 * @throws when the lock was lost while `work` ran, after the work: another
 *   process may have decided the proposal at the same time
 *
 * @example
 * const recordLock = folderRecordLock(folders.proposalRecordsFolder());
 * const proposals = new RunProposals({ ...options, recordLock });
 */
export function folderRecordLock(folder: string, waitMs: number = recordLockWaitMs): RecordLock {
  return async (runId, work) => {
    await mkdir(folder, { recursive: true });
    const file = join(folder, `${runId}.lock`);
    const held: { lost: Error | null } = { lost: null };
    const lock = await takeWaiting(file, waitMs, (error) => {
      held.lost = error;
    });
    try {
      const result = await work();
      if (held.lost !== null) {
        throw new Error(
          `Another process may have decided the proposal of run ${runId} at the same time: ${held.lost.message}`,
        );
      }
      return result;
    } finally {
      await lock.release();
    }
  };
}

/** Takes the lock, trying again while another live process holds it, for up to `waitMs`. */
async function takeWaiting(
  file: string,
  waitMs: number,
  onLost: (error: Error) => void,
): Promise<HeldLock> {
  const giveUpAt = Date.now() + waitMs;
  while (true) {
    try {
      return await holdLock(file, {
        onLost,
        // A renewal that failed is tried again; only a lost lock matters.
        onRenewError: () => {},
      });
    } catch (error) {
      if (!(error instanceof LockHeldError) || Date.now() >= giveUpAt) {
        throw error;
      }
      await sleep(retryDelayMs);
    }
  }
}
