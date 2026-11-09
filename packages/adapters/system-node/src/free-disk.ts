import { statfs } from "node:fs/promises";
import { dirname } from "node:path";
import { isMissing } from "./folder-size.ts";

/**
 * The free space a program without special rights can use on the drive
 * that holds `path`, or its nearest existing parent folder, in bytes.
 * `bavail` leaves out the blocks the system keeps back for its
 * administrator, which a program like the engine can't use.
 *
 * @throws Error when no folder on the way up can be read
 */
export async function freeDisk(path: string): Promise<number> {
  for (let current = path; ; current = dirname(current)) {
    try {
      const drive = await statfs(current, { bigint: true });
      return safeBytes(drive.bavail * drive.bsize);
    } catch (error) {
      // `dirname` of a root is the root itself, so the walk ends there.
      if (!isMissing(error) || dirname(current) === current) throw error;
    }
  }
}

/** Bytes as a number, capped at 8 PiB, where a number stops being exact. */
function safeBytes(bytes: bigint): number {
  return Number(bytes > BigInt(Number.MAX_SAFE_INTEGER) ? BigInt(Number.MAX_SAFE_INTEGER) : bytes);
}
