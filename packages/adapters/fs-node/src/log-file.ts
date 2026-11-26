import type { FileHandle } from "node:fs/promises";
import { openUnlinkedForCut } from "./private-files.ts";

// Helpers for a JSONL log that only grows: one entry per line, a line counting
// once its line break is written.

const lineBreak = 0x0a;

/**
 * Where the log's whole lines end: its size when it ends in a line break or
 * is empty, which is the usual case and needs one byte read; otherwise just
 * after its last line break.
 */
export async function intactEnd(handle: FileHandle, size: number): Promise<number> {
  if (size === 0) {
    return 0;
  }
  const last = new Uint8Array(1);
  await handle.read(last, 0, 1, size - 1);
  if (last[0] === lineBreak) {
    return size;
  }
  const bytes = new Uint8Array(size);
  const { bytesRead } = await handle.read(bytes, 0, size, 0);
  return bytes.subarray(0, bytesRead).lastIndexOf(lineBreak) + 1;
}

/**
 * Writes all of `bytes`, at the end because the handle is opened with
 * O_APPEND. One write may take only part of them and still succeed, so it
 * writes again from where the last one stopped. A write that takes nothing
 * fails the append rather than trying forever.
 */
export async function writeAll(handle: FileHandle, file: string, bytes: Uint8Array): Promise<void> {
  let written = 0;
  while (written < bytes.length) {
    const { bytesWritten } = await handle.write(bytes, written, bytes.length - written);
    if (bytesWritten === 0) {
      throw new Error(
        `Couldn't append to ${JSON.stringify(file)}: the system took none of the last ${bytes.length - written} bytes.`,
      );
    }
    written += bytesWritten;
  }
}

/**
 * Cuts a log back to `bytes`. It opens the log again rather than cutting
 * through the append's handle: on Windows a file opened to append can't be
 * cut shorter (HAL-4361).
 */
export async function cutBack(file: string, bytes: number): Promise<void> {
  const handle = await openUnlinkedForCut(file);
  try {
    await handle.truncate(bytes);
  } finally {
    await handle.close();
  }
}
