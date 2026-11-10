import { createHash, randomUUID } from "node:crypto";
import type { FileHandle } from "node:fs/promises";
import { open, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { compactedChanges, type RecordChange, type RecordStore } from "@halonicjs/ports";
import { KeyedQueue } from "@halonicjs/std";
import { isMissing } from "./links.ts";
import {
  makePrivateFolder,
  openUnlinkedForAppend,
  openUnlinkedForCut,
  readUnlinkedBytes,
} from "./private-files.ts";
import { formatRecordLines, parseRecordLog } from "./record-log.ts";
import { renameOver } from "./rename-over.ts";
import { withRunLock } from "./run-lock.ts";

const logSuffix = ".jsonl";

/** The store's write lock, in the folder beside the logs. Log names are hashes, so it can't be one. */
const lockName = "write.lock";

/** The one key of the in-process queue: every write in this store goes one at a time. */
const writeKey = "write";

const lineBreak = 0x0a;

/** A log as it was before an append added to it, so a failed append can cut it back. */
interface LogBefore {
  file: string;
  bytes: number;
}

/**
 * Records as files in one folder of the user's profile, such as a
 * workspace's `records` folder: one log per collection, one JSON change per
 * line, that only ever grows until it is compacted. A log is named by the
 * SHA-256 of its collection, never by the collection itself, so a
 * collection name such as `../leads` is just a value, and a file system that
 * folds case (macOS, Windows) still keeps `Leads` and `leads` apart.
 *
 * Every write, in this process or another, holds the store's write lock
 * (`write.lock`, with the `RunLockRecord` rules of the run store), so an
 * append can't land between a compact's read and its rename. A compact
 * writes the new log to a temporary file, flushes it to disk and renames it
 * over the old one, so a crash leaves the old log or the new one. Reads take
 * no lock: a line counts only once its line break is written, unless its
 * append fails and is cut back, so a read may briefly see lines that go away.
 *
 * Like the trust store, a log that is a symbolic link, a hard link or not a
 * plain file is refused, never read or written through (HAL-2978, HAL-3009).
 * Only the files are checked, not the folder, which must sit in the profile.
 */
export class FileRecordStore implements RecordStore {
  readonly #root: string;
  readonly #queue = new KeyedQueue();

  /** @param root - the folder for the logs, such as `workspaces/<key>/records` in the profile; created on the first write */
  constructor(root: string) {
    this.#root = resolve(root);
  }

  async append(changes: readonly RecordChange[]): Promise<void> {
    if (changes.length === 0) {
      return;
    }
    // Written to text first, so a change JSON can't hold fails before anything is stored.
    const linesByCollection = linesPerCollection(changes);
    await this.#whileWriting(async () => {
      const before: LogBefore[] = [];
      try {
        for (const [collection, lines] of linesByCollection) {
          await this.#appendLines(this.#file(collection), lines, before);
        }
      } catch (error) {
        await cutBackAll(before);
        throw error;
      }
    });
  }

  async changes(collection: string): Promise<RecordChange[]> {
    const file = this.#file(collection);
    const bytes = await readLog(file);
    return bytes === null ? [] : parseRecordLog(bytes, collection, file).changes;
  }

  async compact(collection: string): Promise<void> {
    const file = this.#file(collection);
    await this.#whileWriting(async () => {
      const bytes = await readLog(file);
      if (bytes === null) {
        return;
      }
      const seeds = compactedChanges(collection, parseRecordLog(bytes, collection, file).changes);
      if (seeds.length === 0) {
        await rm(file, { force: true });
        return;
      }
      await replaceFile(file, formatRecordLines(seeds));
    });
  }

  /** Runs `work` as the only writer: first in this process, then across processes with the write lock. */
  async #whileWriting(work: () => Promise<void>): Promise<void> {
    await this.#queue.run(writeKey, async () => {
      await makePrivateFolder(this.#root);
      await withRunLock(join(this.#root, lockName), work);
    });
  }

  /**
   * Adds lines to a log, after cutting off a torn last line a crash left,
   * so the new lines aren't glued onto it. Notes the log's size before in
   * `before`, so a failed append can cut it back.
   */
  async #appendLines(file: string, lines: string, before: LogBefore[]): Promise<void> {
    const handle = await openUnlinkedForAppend(file);
    try {
      const { size } = await handle.stat();
      const bytes = await intactEnd(handle, size);
      if (bytes < size) {
        await cutBack(file, bytes);
      }
      before.push({ file, bytes });
      await writeAll(handle, file, new TextEncoder().encode(lines));
    } finally {
      await handle.close();
    }
  }

  #file(collection: string): string {
    return join(this.#root, `${hashCollection(collection)}${logSuffix}`);
  }
}

/**
 * The hash of a collection name's UTF-16 code units, little-endian, as the
 * trust store hashes locations: UTF-8 would turn every lone surrogate into
 * U+FFFD, so two different names would share one log.
 */
function hashCollection(collection: string): string {
  return createHash("sha256").update(collection, "utf16le").digest("hex");
}

/** The changes as log lines, by collection, in the order they came. */
function linesPerCollection(changes: readonly RecordChange[]): Map<string, string> {
  const lines = new Map<string, string>();
  for (const change of changes) {
    lines.set(
      change.collection,
      (lines.get(change.collection) ?? "") + formatRecordLines([change]),
    );
  }
  return lines;
}

/** A log's bytes, or `null` when there is none. A link is refused, see `readUnlinkedBytes`. */
async function readLog(file: string): Promise<Uint8Array | null> {
  try {
    return await readUnlinkedBytes(file);
  } catch (error) {
    if (isMissing(error)) {
      return null;
    }
    throw error;
  }
}

/**
 * Where the log's whole lines end: its size when it ends in a line break or
 * is empty, which is the usual case and needs one byte read; otherwise just
 * after its last line break.
 */
async function intactEnd(handle: FileHandle, size: number): Promise<number> {
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
async function writeAll(handle: FileHandle, file: string, bytes: Uint8Array): Promise<void> {
  let written = 0;
  while (written < bytes.length) {
    const { bytesWritten } = await handle.write(bytes, written, bytes.length - written);
    if (bytesWritten === 0) {
      throw new Error(
        `Couldn't append to record log ${JSON.stringify(file)}: the system took none of the last ${bytes.length - written} bytes.`,
      );
    }
    written += bytesWritten;
  }
}

/**
 * Cuts every log a failed append added to back to its size before, so the
 * append stores nothing. When a cut fails too, the append's own error is
 * the one worth reporting; its lines left behind then count as stored, as
 * after a crash.
 */
async function cutBackAll(before: readonly LogBefore[]): Promise<void> {
  for (const { file, bytes } of before) {
    try {
      await cutBack(file, bytes);
    } catch {
      // Left as it is; see above.
    }
  }
}

/**
 * Cuts a log back to `bytes`. It opens the log again rather than cutting
 * through the append's handle: on Windows a file opened to append can't be
 * cut shorter (HAL-4361).
 */
async function cutBack(file: string, bytes: number): Promise<void> {
  const handle = await openUnlinkedForCut(file);
  try {
    await handle.truncate(bytes);
  } finally {
    await handle.close();
  }
}

/**
 * Replaces a log with `text` in one step: a new private file, flushed to
 * disk, renamed over the old one. On Windows a rename another program
 * briefly blocks is tried again (see `renameOver`); the compact still holds
 * the write lock while it waits, so an append that waits on the compact
 * lands on the new log, or on the old one when the rename fails.
 */
async function replaceFile(file: string, text: string): Promise<void> {
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    const handle = await open(temporary, "wx", 0o600);
    try {
      await handle.writeFile(text, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    await renameOver(temporary, file);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}
