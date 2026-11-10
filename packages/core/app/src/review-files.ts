// What the review service and its write hook share (HAL-3277): the records,
// one queue per file, and the few ways a file or record changes. Internal to
// `core/app`.

import type { DefinitionStore, Digest, ExpectedContent } from "@halonicjs/ports";
import { contentDigest, KeyedQueue } from "@halonicjs/std";
import { EventBus, type ListenerErrorHandler } from "./event-bus.ts";
import type { ReviewRecord } from "./review-record.ts";
import { type ReviewRecordList, ReviewRecords } from "./review-records.ts";
import type { Trash } from "./review-types.ts";

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
   * Receives the error of an `onDidChange` listener that threw, so the
   * change itself still succeeds. Without it, the call that changed the
   * records throws that error, which suits tests.
   */
  readonly onListenerError?: ListenerErrorHandler;
  /** Where the assistant's deletes go. Without one, the assistant can't delete files. */
  readonly trash?: Trash;
  /**
   * Whether the workspace is trusted now. Read on every assistant write:
   * untrusted, the assistant may change only Halonic item files
   * (`workspace.trust.assistant-untrusted-items-only`).
   */
  readonly isTrusted: () => boolean;
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
  private readonly digest: Digest;
  private readonly records: ReviewRecords;
  private readonly queue = new KeyedQueue();
  /**
   * Record reads, saves and listings run one at a time, so a listing never
   * reads a record while it is being saved and drops it as unreadable.
   */
  private readonly recordAccess = new KeyedQueue();
  private readonly events: EventBus<ReviewEvents>;
  private readonly trashBin: Trash | undefined;
  /** Whether the workspace is trusted now. */
  readonly isTrusted: () => boolean;
  /** The paths with a record, read once, so a write to any other file costs no extra read. */
  private reviewed: Promise<Set<string>> | null = null;

  constructor(options: ReviewServiceOptions) {
    this.store = options.store;
    this.digest = options.digest;
    this.records = new ReviewRecords(options.records, options.digest);
    this.events = new EventBus<ReviewEvents>(options.onListenerError);
    this.trashBin = options.trash;
    this.isTrusted = options.isTrusted;
  }

  /**
   * The trash the assistant's deletes go to.
   *
   * @throws Error when the host gave none
   */
  trash(): Trash {
    if (this.trashBin === undefined) {
      throw new Error("This workspace has no trash, so the assistant can't delete files.");
    }
    return this.trashBin;
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
  async hasRecord(path: string): Promise<boolean> {
    return (await this.reviewedPaths()).has(path);
  }

  /** The record of one file; `null` for none, or one that can't be read. */
  async read(path: string): Promise<ReviewRecord | null> {
    const read = await this.withRecords(() => this.records.read(path));
    return read.status === "found" ? read.record : null;
  }

  /** Every record, or those of some files, as `ReviewRecords` gives them. */
  async list(paths?: readonly string[]): Promise<ReviewRecordList> {
    if (paths === undefined) {
      const list = await this.withRecords(() => this.records.all());
      this.reviewed = Promise.resolve(new Set(list.records.map((record) => record.path)));
      return list;
    }
    const list = await this.withRecords(() => this.records.some(paths));
    const reviewed = await this.reviewedPaths();
    for (const dropped of list.dropped) {
      if (dropped.path !== null) {
        reviewed.delete(dropped.path);
      }
    }
    return list;
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
  async putRecord(path: string, record: ReviewRecord | null): Promise<void> {
    const reviewed = await this.reviewedPaths();
    if (record === null) {
      await this.withRecords(() => this.records.remove(path));
      reviewed.delete(path);
    } else {
      await this.withRecords(() => this.records.save(record));
      reviewed.add(path);
    }
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

  /**
   * Puts a file back to its record's baseline, if it is still as last
   * seen: from the trash when the record names an entry that is still
   * there, by writing the baseline otherwise. Gives `false`, changing
   * nothing, when the file moved on or something is at its path again.
   */
  async putBaseline(record: ReviewRecord): Promise<boolean> {
    if (record.trashed !== undefined) {
      const restored = await this.trash().restore(record.trashed.trashId);
      if (restored.status !== "missing") {
        return restored.status === "done";
      }
    }
    return this.putFile(record.path, record.seen, record.baseline);
  }

  /** The digest the store compares, or `"absent"` for no file. */
  async digestOf(text: string | null): Promise<ExpectedContent> {
    return text === null ? "absent" : contentDigest(text, this.digest);
  }

  private withRecords<T>(work: () => Promise<T>): Promise<T> {
    return this.recordAccess.run("records", work);
  }

  private reviewedPaths(): Promise<Set<string>> {
    if (this.reviewed === null) {
      const loading = this.withRecords(() => this.records.all()).then(
        ({ records }) => new Set(records.map((record) => record.path)),
      );
      // A failed read is tried again next time instead of being kept.
      loading.catch(() => {
        if (this.reviewed === loading) {
          this.reviewed = null;
        }
      });
      this.reviewed = loading;
    }
    return this.reviewed;
  }
}
