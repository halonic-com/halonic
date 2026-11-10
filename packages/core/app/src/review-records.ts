// Keeps the review records in the workspace's own `DefinitionStore`, so they
// work the same in a folder, in memory and in the desktop app's store.

import type { DefinitionStore } from "@halonicjs/ports";
import {
  parseReviewRecord,
  type ReviewRecord,
  reviewedPath,
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

/** A record that {@link ReviewRecords.all} removed because it couldn't be read. */
export interface DroppedReviewRecord {
  /** The file it was about. */
  readonly path: string;
  readonly reason: string;
}

/** Every record that could be read, and the ones removed because they couldn't. */
export interface ReviewRecordList {
  readonly records: readonly ReviewRecord[];
  readonly dropped: readonly DroppedReviewRecord[];
}

/**
 * The review records of one workspace, one per file with changes to review
 * (`app.review-record`).
 *
 * @example
 * const records = new ReviewRecords(store);
 * await records.save({ path: "agents/clerk.agent.yaml", baseline, card, seen });
 * const read = await records.read("agents/clerk.agent.yaml"); // { status: "found", record }
 */
export class ReviewRecords {
  private readonly store: DefinitionStore;

  constructor(store: DefinitionStore) {
    this.store = store;
  }

  /** The record of one file. */
  async read(path: string): Promise<ReviewRecordRead> {
    const text = await this.store.read(reviewRecordPath(path));
    if (text === null) {
      return { status: "none" };
    }
    const parsed = parseReviewRecord(text, path);
    if (!parsed.ok) {
      return { status: "unreadable", reason: parsed.error };
    }
    return { status: "found", record: parsed.value };
  }

  /** Creates or replaces the record of `record.path`. */
  async save(record: ReviewRecord): Promise<void> {
    await this.store.write(reviewRecordPath(record.path), serializeReviewRecord(record));
  }

  /** Removes the record of one file. Removing one that isn't there is not an error. */
  async remove(path: string): Promise<void> {
    await this.store.remove(reviewRecordPath(path));
  }

  /**
   * Every record, sorted by path. A record that can't be read is removed
   * and listed in `dropped`, so that file's changes become ordinary changes
   * (AI changes 1.9). A stray file in the folder that isn't a record is
   * left alone.
   */
  async all(): Promise<ReviewRecordList> {
    const records: ReviewRecord[] = [];
    const dropped: DroppedReviewRecord[] = [];
    for (const recordPath of await this.store.list(reviewRecordFolder)) {
      const path = reviewedPath(recordPath);
      if (path === null) {
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
