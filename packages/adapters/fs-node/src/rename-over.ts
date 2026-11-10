import { rename } from "node:fs/promises";
import { setTimeout as wait } from "node:timers/promises";

/**
 * Error codes Windows gives when a file can't be replaced because another
 * program has it open for a moment, such as a virus scanner or the search
 * indexer. They pass, so a rename that fails with one is tried again.
 */
const briefLockCodes: ReadonlySet<string> = new Set(["EPERM", "EBUSY", "EACCES"]);

/**
 * How long to wait before each new try, in milliseconds: about 1.3 seconds
 * in all, enough for a scanner to let go and short enough that a save
 * doesn't seem to hang.
 */
const retryDelays: readonly number[] = [10, 20, 40, 80, 160, 320, 640];

/** What {@link renameOver} runs on; tests replace parts of it. */
export interface RenameOverSystem {
  readonly platform: NodeJS.Platform;
  rename(from: string, to: string): Promise<void>;
  wait(milliseconds: number): Promise<unknown>;
}

const nodeSystem: RenameOverSystem = { platform: process.platform, rename, wait };

/**
 * Renames `from` over `to`, replacing it in one step. On Windows a rename
 * fails while another program has `to` open for a moment; it is then tried
 * again, after a short wait each time, and the last error is thrown if the
 * file stays locked. On other systems the first error is thrown.
 */
export async function renameOver(
  from: string,
  to: string,
  system: RenameOverSystem = nodeSystem,
): Promise<void> {
  const delays = system.platform === "win32" ? retryDelays : [];
  for (const delay of delays) {
    try {
      await system.rename(from, to);
      return;
    } catch (error) {
      if (!isBriefLock(error)) {
        throw error;
      }
    }
    await system.wait(delay);
  }
  await system.rename(from, to);
}

function isBriefLock(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" && briefLockCodes.has(code);
}
