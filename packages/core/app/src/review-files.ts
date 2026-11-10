// What the review service and its write hook share (HAL-3277): the records,
// one queue per file, and the few ways a file or record changes. Internal to
// `core/app`.

import type { DefinitionStore, Digest, ExpectedContent } from "@halonicjs/ports";
import { contentDigest, KeyedQueue } from "@halonicjs/std";
import { EventBus, type ListenerErrorHandler } from "./event-bus.ts";
import type { ReviewRecord } from "./review-record.ts";
import { type ReviewRecordList, ReviewRecords } from "./review-records.ts";

/** What the review service needs from the host. */
export interface ReviewServiceOptions {
  /** The workspace's files. */
  readonly store: DefinitionStore;
  /**
   * The records' own store, rooted at the workspace's review folder in the
   * profile (`reviewFolder()` of `workspaceFolders`). Never the workspace's
   * store: git could bring a record in from there (HAL-3417).
   */
  readonly records: DefinitionStore;
  /** Hashes file text for the write-if-unchanged check, and names the records. */
  readonly digest: Digest;
  /**
   * Whether the workspace is trusted, read on every write the assistant
   * asks for. While it isn't, the assistant may write only Halonic item
   * files, and what it writes is marked as written untrusted.
   */
  readonly isTrusted: () => boolean;
  /**
   * Receives the error of an `onDidChange` listener that threw, so the
   * change itself still succeeds. Without it, the call that changed the
   * records throws that error, which suits tests.
   */
  readonly onListenerError?: ListenerErrorHandler;
}

interface ReviewEvents {
  changed: { readonly paths: readonly string[] };
}

/**
 * The files with changes to review and their records. Every change to a
 * file and its record runs in that file's turn ({@link turn}), so a save
 * and a Reject on the same file can't interleave.
 */
export class ReviewFiles {
  readonly store: DefinitionStore;
  readonly isTrusted: () => boolean;
  private readonly digest: Digest;
  private readonly records: ReviewRecords;
  private readonly queue = new KeyedQueue();
  /**
   * Record reads, saves and listings run one at a time, so a listing never
   * reads a record while it is being saved and drops it as unreadable.
   */
  private readonly recordAccess = new KeyedQueue();
  private readonly events: EventBus<ReviewEvents>;
  /**
   * The paths with a record, read once, so a write to any other file costs
   * no extra read. `null` until first read. It only changes inside a
   * {@link withRecords} turn, so it changes in the same order as the records.
   */
  private reviewed: Set<string> | null = null;

  constructor(options: ReviewServiceOptions) {
    this.store = options.store;
    this.isTrusted = options.isTrusted;
    this.digest = options.digest;
    this.records = new ReviewRecords(options.records, options.digest);
    this.events = new EventBus<ReviewEvents>(options.onListenerError);
  }

  /** Runs `work` once the work queued before it for the same file is done. */
  turn<T>(path: string, work: () => Promise<T>): Promise<T> {
    return this.queue.run(path, work);
  }

  onDidChange(listener: (paths: readonly string[]) => void): () => void {
    return this.events.on("changed", ({ paths }) => listener(paths));
  }

  /** Tells the listeners which files' records changed; nothing when none did. */
  changed(paths: readonly string[]): void {
    if (paths.length > 0) {
      this.events.emit("changed", { paths });
    }
  }

  /** Whether the file has a record, from the paths read when first asked. */
  hasRecord(path: string): Promise<boolean> {
    return this.withRecords(async () => (await this.reviewedPaths()).has(path));
  }

  /** The record of one file; `null` for none, or one that can't be read. */
  async read(path: string): Promise<ReviewRecord | null> {
    const read = await this.withRecords(() => this.records.read(path));
    return read.status === "found" ? read.record : null;
  }

  /** Every record, or those of some files, as `ReviewRecords` gives them. */
  list(paths?: readonly string[]): Promise<ReviewRecordList> {
    return this.withRecords(async () => {
      if (paths === undefined) {
        const list = await this.records.all();
        this.reviewed = new Set(list.records.map((record) => record.path));
        return list;
      }
      const list = await this.records.some(paths);
      for (const dropped of list.dropped) {
        if (dropped.path !== null) {
          this.reviewed?.delete(dropped.path);
        }
      }
      return list;
    });
  }

  /** Saves a record, or removes it when the baseline is the file again: then nothing is left to review. */
  async keep(record: ReviewRecord): Promise<ReviewRecord | null> {
    if (record.seen === (await this.digestOf(record.baseline))) {
      await this.putRecord(record.path, null);
      return null;
    }
    await this.putRecord(record.path, record);
    return record;
  }

  /** Saves the record of `path`, or removes it for `null`. */
  putRecord(path: string, record: ReviewRecord | null): Promise<void> {
    return this.withRecords(async () => {
      if (record === null) {
        await this.records.remove(path);
        this.reviewed?.delete(path);
      } else {
        await this.records.save(record);
        this.reviewed?.add(path);
      }
    });
  }

  /**
   * Writes `text` into the file, or removes it for `null`, if it still
   * holds what `expected` says. Gives `false`, writing nothing, if not.
   */
  async putFile(path: string, expected: ExpectedContent, text: string | null): Promise<boolean> {
    if (text !== null) {
      const written = await this.store.write(path, text, { expected });
      return written.status === "written";
    }
    // The port has no remove-if-unchanged; checking just before is the closest.
    if ((await this.digestOf(await this.store.read(path))) !== expected) {
      return false;
    }
    await this.store.remove(path);
    return true;
  }

  /** The digest the store compares, or `"absent"` for no file. */
  async digestOf(text: string | null): Promise<ExpectedContent> {
    return text === null ? "absent" : contentDigest(text, this.digest);
  }

  private withRecords<T>(work: () => Promise<T>): Promise<T> {
    return this.recordAccess.run("records", work);
  }

  /**
   * The paths with a record, read from the records the first time. Call it
   * only inside a {@link withRecords} turn. A failed read leaves nothing
   * kept, so the next call tries again.
   */
  private async reviewedPaths(): Promise<Set<string>> {
    if (this.reviewed === null) {
      const { records } = await this.records.all();
      this.reviewed = new Set(records.map((record) => record.path));
    }
    return this.reviewed;
  }
}
