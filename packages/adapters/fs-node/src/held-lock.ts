// A lock one process holds for as long as it runs, such as the one engine of
// a workspace (HAL-4032). It follows the run lock's rules (`RunLockRecord`
// in `@halonicjs/ports`): the same record in the file, and the same judgement
// of a stale lock, so the lock of a holder that crashed is taken over. A run
// lock lives for milliseconds; this one lives for hours, so its holder
// renews it: it writes its record again, with a new `takenAt`, long before
// the lock would count as stale.

import { randomUUID } from "node:crypto";
import { rename, rm, writeFile } from "node:fs/promises";
import { type RunLockRecord, runLockStaleAfterMs } from "@halonicjs/ports";
import { type BusySystem, nodeBusySystem, retryWhileBusy } from "./busy-retry.ts";
import {
  createExclusive,
  isStale,
  ownRecord,
  readLock,
  readTakenLock,
  releaseLock,
  removeStale,
} from "./run-lock.ts";

/** How often the holder renews its lock: a third of the time after which it would be stale. */
export const heldLockRenewEveryMs = Math.floor(runLockStaleAfterMs / 3);

/** Runs `renew` once after `ms` milliseconds, and gives what cancels it. */
export type RenewTimer = (renew: () => Promise<void>, ms: number) => () => void;

/** Node's own timer, which doesn't keep the process running by itself. */
const systemRenewTimer: RenewTimer = (renew, ms) => {
  const timer = setTimeout(() => void renew(), ms);
  timer.unref();
  return () => clearTimeout(timer);
};

/** Refuses a lock that another live process holds. */
export class LockHeldError extends Error {
  /** The holder's record, or `null` when its file holds none yet. */
  readonly holder: RunLockRecord | null;

  constructor(file: string, holder: RunLockRecord | null) {
    const who =
      holder === null
        ? "another process"
        : `process ${holder.pid} on ${holder.host}, since ${holder.takenAt}`;
    super(`The lock ${file} is held by ${who}.`);
    this.name = "LockHeldError";
    this.holder = holder;
  }
}

/** A lock this process holds until {@link HeldLock.release}. */
export interface HeldLock {
  /** Stops renewing the lock and removes it, while it is still this process's. Safe to call twice. */
  release(): Promise<void>;
}

/** What {@link holdLock} tells its holder, and the timer it renews with. */
export interface HoldLockOptions {
  /**
   * Hears that the lock was lost: another process removed it as stale, so
   * this process missed its renewals for longer than the stale limit. The
   * lock isn't renewed any more; the holder should stop what the lock
   * guards.
   */
  onLost(error: Error): void;
  /** Hears a renewal that failed; the next one is tried as planned. */
  onRenewError(error: unknown): void;
  /** How the renewals are timed; Node's own timer by default. */
  setTimer?: RenewTimer;
  /** The platform and clock the busy retries use; tests play Windows with it. */
  system?: BusySystem;
}

/**
 * Takes the lock `file` and holds it, renewing it every
 * {@link heldLockRenewEveryMs}, until it is released. Removes a stale lock,
 * as `withRunLock` does, but never waits for a live one.
 *
 * @param file - the lock file, in an existing folder
 * @throws LockHeldError when another live process holds the lock
 *
 * @example
 * const lock = await holdLock(join(folder, "engine.lock"), { onLost, onRenewError });
 * // … the work the lock guards …
 * await lock.release();
 */
export async function holdLock(file: string, options: HoldLockOptions): Promise<HeldLock> {
  const system = options.system ?? nodeBusySystem;
  const setTimer = options.setTimer ?? systemRenewTimer;
  let ownText = await takeOrRefuse(file, system);
  let released = false;
  let renewing: Promise<void> = Promise.resolve();
  let cancel: () => void = () => {};

  const renewLater = () => {
    cancel = setTimer(() => {
      renewing = renewOnce();
      return renewing;
    }, heldLockRenewEveryMs);
  };
  const renewOnce = async () => {
    try {
      const renewal = await renew(file, ownText, system);
      if ("lostBecause" in renewal) {
        released = true;
        options.onLost(new Error(`The lock ${file} ${renewal.lostBecause}.`));
        return;
      }
      ownText = renewal.renewedText;
    } catch (error) {
      options.onRenewError(error);
    }
    if (!released) {
      renewLater();
    }
  };
  renewLater();

  return {
    release: async () => {
      if (released) {
        return;
      }
      released = true;
      cancel();
      await renewing;
      await retryWhileBusy(() => releaseLock(file, ownText), system);
    },
  };
}

/** Takes the lock, removing a stale one, and gives the text written into it. */
async function takeOrRefuse(file: string, system: BusySystem): Promise<string> {
  while (true) {
    const ownText = JSON.stringify(ownRecord());
    if (await retryWhileBusy(() => createExclusive(file, ownText), system)) {
      return ownText;
    }
    const found = await readTakenLock(file, system);
    if (found === null) {
      // Released between our create and our read: try again straight away.
      continue;
    }
    if (!isStale(found, Date.now())) {
      throw new LockHeldError(file, found.record);
    }
    await removeStale(file, found.text, system);
  }
}

/** A renewal's outcome: the lock's new text, or why the lock was lost. */
type Renewal = { renewedText: string } | { lostBecause: string };

/**
 * Writes this process's record into the lock again, with `takenAt` now, and
 * gives its text; or why the lock is lost: it doesn't hold `ownText` any
 * more, or it is older than the stale limit. The new record
 * replaces the old one whole, by a rename, so another process never reads
 * half of it.
 *
 * A lock older than the stale limit (this process missed its renewals, say
 * while the computer slept) may be in the middle of being taken over by
 * another process right now. Renewing it could overwrite that process's
 * fresh lock, so it is given up instead, and removed while it is still
 * this process's.
 */
async function renew(file: string, ownText: string, system: BusySystem): Promise<Renewal> {
  const found = await retryWhileBusy(() => readLock(file), system);
  if (found?.text !== ownText) {
    return { lostBecause: "was taken over by another process" };
  }
  if (isStale(found, Date.now())) {
    await retryWhileBusy(() => releaseLock(file, ownText), system);
    return { lostBecause: "wasn't renewed within the stale limit, so it was given up" };
  }
  const renewedText = JSON.stringify(ownRecord());
  const next = `${file}.${randomUUID()}.renew`;
  try {
    await writeFile(next, renewedText, "utf8");
    await retryWhileBusy(() => rename(next, file), system);
  } finally {
    await rm(next, { force: true });
  }
  return { renewedText };
}
