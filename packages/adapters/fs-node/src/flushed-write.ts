import { open } from "node:fs/promises";

/** How {@link writeFlushedFile} creates its file. */
export interface FlushedWriteOptions {
  /** The new file's mode before the umask; `0o600` for a file in the user's profile. Default `0o666`. */
  mode?: number;
}

/**
 * Creates `file` holding `data` and flushes it to disk before it returns.
 * It fails when `file` is already there, so a link put in its place can't
 * redirect the write.
 *
 * The stores write a file this way, then rename it over the old one. Without
 * the flush, a power cut soon after the rename can leave the new name on a
 * file whose data never reached the disk: an empty file where the old one
 * was. With it, a reader after a crash finds the old text or the new, never
 * half of it. The rename itself may still be lost, which leaves the old file
 * (Julian, HAL-5215).
 */
export async function writeFlushedFile(
  file: string,
  data: string | Uint8Array,
  { mode = 0o666 }: FlushedWriteOptions = {},
): Promise<void> {
  const handle = await open(file, "wx", mode);
  try {
    await handle.writeFile(data);
    await handle.sync();
  } finally {
    await handle.close();
  }
}
