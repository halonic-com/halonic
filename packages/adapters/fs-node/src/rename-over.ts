import { rename } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";

/**
 * How long to wait before each new try of a rename Windows refused, in
 * milliseconds: 10, 20, 40 and 80, then 160 eleven times, under two seconds
 * in all. A scanner or indexer holds a file for a few milliseconds to a few
 * hundred. A program that keeps reading the file, such as Studio, holds it
 * most of the time, so the rename only gets through in a gap between two
 * reads; a third of a second was too few tries for that on a busy computer
 * (HAL-6758). The limit matches `busyLimitMs`.
 */
export const renameRetryDelaysMs: readonly number[] = [
  10,
  20,
  40,
  80,
  ...Array<number>(11).fill(160),
];

/**
 * Error codes Windows gives when another program, such as an antivirus
 * scanner, an editor or the search indexer, briefly has the target open.
 */
const busyCodes = new Set(["EPERM", "EBUSY"]);

/** The parts of the system {@link renameOver} uses, so a test can play Windows. */
export interface RenameSystem {
  /** `process.platform`: retries happen only on `win32`. */
  platform: string;
  rename(from: string, to: string): Promise<void>;
  wait(ms: number): Promise<void>;
}

const nodeSystem: RenameSystem = {
  get platform() {
    return process.platform;
  },
  rename,
  wait: async (ms) => {
    await sleep(ms);
  },
};

/**
 * Renames `from` over `to`. On Windows a rename fails with `EPERM` or
 * `EBUSY` while another program briefly holds `to` open, so there it tries
 * again after each of {@link renameRetryDelaysMs} and throws the last error
 * if the file stays held. Any other error, and every error on other systems,
 * is thrown at once: there `EPERM` means a real lack of permission.
 */
export async function renameOver(
  from: string,
  to: string,
  system: RenameSystem = nodeSystem,
): Promise<void> {
  const delays = system.platform === "win32" ? renameRetryDelaysMs : [];
  for (const delay of delays) {
    try {
      await system.rename(from, to);
      return;
    } catch (error) {
      if (!isBusy(error)) {
        throw error;
      }
    }
    await system.wait(delay);
  }
  await system.rename(from, to);
}

function isBusy(error: unknown): boolean {
  return busyCodes.has(String((error as { code?: unknown }).code));
}
