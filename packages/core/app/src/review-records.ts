// Keeps the review records in the workspace's own `DefinitionStore`, so they
// work the same in a folder, in memory and in the desktop app's store. Only
// the review service uses this, through the store underneath the
// `ReviewingDefinitionStore` that hides the records from everyone else.

import { isReservedPath } from "@halonicjs/format";
import type { DefinitionStore, Digest } from "@halonicjs/ports";
import {
  parseReviewRecord,
  type ReviewRecord,
  reviewRecordFolder,
  reviewRecordPath,
  serializeReviewRecord,
} from "./review-record.ts";

/** What {@link ReviewRecords.read} found for one file. */
export type ReviewRecordRead =
  | { readonly status: "none" }
  | { readonly status: "found"; readonly record: ReviewRecord }
  | {
      readonly status: "unreadable";
      /** What is wrong with it, such as "it isn't valid JSON". */
      readonly reason: string;
    };

/** A record removed because it couldn't be read. */
export interface DroppedReviewRecord {
  /** The file it was about, or `null` when the record is too damaged to say. */
  readonly path: string | null;
  readonly reason: string;
}

/** The records that could be read, sorted by path, and the ones removed because they couldn't. */
export interface ReviewRecordList {
  readonly records: readonly ReviewRecord[];
  readonly dropped: readonly DroppedReviewRecord[];
}

/**
 * The review records of one workspace, one per file with changes to review
 * (`app.review-record`).
 *
 * @example
 * const records = new ReviewRecords(innerStore, digest);
 * await records.save({ path: "agents/clerk.agent.yaml", baseline, card, seen });
 * const read = await records.read("agents/clerk.agent.yaml"); // { status: "found", record }
 */
export class ReviewRecords {
  private readonly store: DefinitionStore;
  private readonly digest: Digest;

  /**
   * @param store - the workspace's store underneath the `ReviewingDefinitionStore`, which refuses the records' folder
   * @param digest - names each record by the SHA-256 of its file's path
   */
  constructor(store: DefinitionStore, digest: Digest) {
    this.store = store;
    this.digest = digest;
  }

  /** The record of one file. */
  async read(path: string): Promise<ReviewRecordRead> {
    const text = await this.store.read(await reviewRecordPath(path, this.digest));
    if (text === null) {
      return { status: "none" };
    }
    const parsed = parseReviewRecord(text);
    if (!parsed.ok) {
      return { status: "unreadable", reason: parsed.error };
    }
    if (parsed.value.path !== path) {
      return { status: "unreadable", reason: wrongPlace(parsed.value.path) };
    }
    return { status: "found", record: parsed.value };
  }

  /** Creates or replaces the record of `record.path`. */
  async save(record: ReviewRecord): Promise<void> {
    await this.store.write(
      await reviewRecordPath(record.path, this.digest),
      serializeReviewRecord(record),
    );
  }

  /** Removes the record of one file. Removing one that isn't there is not an error. */
  async remove(path: string): Promise<void> {
    await this.store.remove(await reviewRecordPath(path, this.digest));
  }

  /**
   * Every record. A record that can't be read, or that sits under another
   * file's name, is removed and listed in `dropped`, so that file's changes
   * become ordinary changes (AI changes 1.9). A file in the folder that
   * isn't named like a record is left alone.
   */
  async all(): Promise<ReviewRecordList> {
    const records: ReviewRecord[] = [];
    const dropped: DroppedReviewRecord[] = [];
    for (const recordPath of await this.store.list(reviewRecordFolder)) {
      if (!recordName.test(recordPath.slice(reviewRecordFolder.length + 1))) {
        continue;
      }
      const text = await this.store.read(recordPath);
      if (text === null) {
        // Removed since it was listed: nothing to read or drop.
        continue;
      }
      const parsed = parseReviewRecord(text);
      if (!parsed.ok) {
        await this.store.remove(recordPath);
        dropped.push({ path: null, reason: parsed.error });
      } else if ((await reviewRecordPath(parsed.value.path, this.digest)) !== recordPath) {
        await this.store.remove(recordPath);
        dropped.push({ path: null, reason: wrongPlace(parsed.value.path) });
      } else {
        records.push(parsed.value);
      }
    }
    return { records: records.sort(byPath), dropped };
  }

  /**
   * The records of these files, as {@link all} gives them. A file without a
   * record, or inside a reserved `.halonic/` folder, is left out.
   */
  async some(paths: readonly string[]): Promise<ReviewRecordList> {
    const records: ReviewRecord[] = [];
    const dropped: DroppedReviewRecord[] = [];
    for (const path of [...new Set(paths)].sort()) {
      if (isReservedPath(path)) {
        continue;
      }
      const read = await this.read(path);
      if (read.status === "found") {
        records.push(read.record);
      } else if (read.status === "unreadable") {
        await this.remove(path);
        dropped.push({ path, reason: read.reason });
      }
    }
    return { records, dropped };
  }
}

/** A record's file name: the 64 hex characters of a SHA-256 and `.json`. */
const recordName = /^[0-9a-f]{64}\.json$/u;

function wrongPlace(path: string): string {
  return `it is about ${JSON.stringify(path)}, which has another record name`;
}

function byPath(one: ReviewRecord, other: ReviewRecord): number {
  if (one.path === other.path) {
    return 0;
  }
  return one.path < other.path ? -1 : 1;
}
