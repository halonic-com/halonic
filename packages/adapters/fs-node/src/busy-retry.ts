import { setTimeout as sleep } from "node:timers/promises";

/**
 * How long a step may keep failing as busy before its error is thrown, in
 * milliseconds. A file another writer deletes is gone in milliseconds; this
 * leaves room for a slow scanner and a loaded computer. The Rust run lock in
 * the Studio shell waits as long (`busy.rs`).
 */
export const busyLimitMs = 2_000;

/** How long to wait before trying a busy step again, in milliseconds. */
export const busyDelayMs = 15;

/**
 * Error codes Windows gives for a file that is busy right now. While a
 * writer deletes a file, it stays delete-pending until the last handle to it
 * is closed, and creating, reading or renaming it fails with access denied,
 * which Node reports as `EPERM`. A program that briefly has the file open
 * without sharing it, such as a virus scanner, gives a sharing violation:
 * `EBUSY`.
 */
const busyCodes = new Set(["EPERM", "EBUSY"]);

/** The parts of the system {@link retryWhileBusy} uses, so a test can play Windows. */
export interface BusySystem {
  /** `process.platform`: retries happen only on `win32`. */
  platform: string;
  /** The time now, in milliseconds. */
  now(): number;
  wait(ms: number): Promise<void>;
}

export const nodeBusySystem: BusySystem = {
  get platform() {
    return process.platform;
  },
  now: () => performance.now(),
  wait: async (ms) => {
    await sleep(ms);
  },
};

/**
 * Runs `step` until it succeeds or fails with an error that isn't busy. On
 * Windows, a step that fails with `EPERM` or `EBUSY` is tried again every
 * {@link busyDelayMs} for up to {@link busyLimitMs}, then its last error is
 * thrown: a folder this user may not write to gives `EPERM` too, and that
 * error must reach the caller instead of making it wait forever. On other
 * systems these codes mean a real refusal and are thrown at once.
 */
export async function retryWhileBusy<T>(
  step: () => Promise<T>,
  system: BusySystem = nodeBusySystem,
): Promise<T> {
  const started = system.now();
  while (true) {
    try {
      return await step();
    } catch (error) {
      const retry = isBusy(error, system.platform) && system.now() - started < busyLimitMs;
      if (!retry) {
        throw error;
      }
    }
    await system.wait(busyDelayMs);
  }
}

function isBusy(error: unknown, platform: string): boolean {
  return platform === "win32" && busyCodes.has(String((error as { code?: unknown }).code));
}
