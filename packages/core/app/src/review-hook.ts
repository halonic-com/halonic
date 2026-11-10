// The write hook (AI changes 1.4, HAL-3277): every write to a file with
// changes to review that isn't the assistant's moves the baseline along, so
// an edit elsewhere in the file never shows up as the assistant's, and an
// edit inside one of the assistant's changes accepts it.

import type { WriteOptions, WriteResult } from "@halonicjs/ports";
import { mergedText, mergeLines } from "@halonicjs/std";
import { catchUp } from "./review-catch-up.ts";
import type { ReviewFiles } from "./review-files.ts";
import type { ReviewRecord } from "./review-record.ts";

/** Who carries out the writes a `ReviewingDefinitionStore` passes on: the review service's write hook. */
export interface FileWriter {
  write(path: string, content: string, options?: WriteOptions): Promise<WriteResult>;
  remove(path: string): Promise<void>;
}

/**
 * Writes for everyone but the review service (`app.review-other-writes-merge`).
 * A file without a record is written as it is; one with a record is written
 * in its turn, then its baseline is merged with the write.
 */
export class ReviewWriteHook implements FileWriter {
  private readonly files: ReviewFiles;

  constructor(files: ReviewFiles) {
    this.files = files;
  }

  write(path: string, content: string, options?: WriteOptions): Promise<WriteResult> {
    return this.files.turn(path, async () => {
      if (!(await this.files.hasRecord(path))) {
        return this.files.store.write(path, content, options);
      }
      const before = await this.files.store.read(path);
      await this.catchUp(path, before);
      const result = await this.files.store.write(path, content, options);
      if (result.status === "written") {
        await this.moveBaseline(path, before, content);
      }
      return result;
    });
  }

  remove(path: string): Promise<void> {
    return this.files.turn(path, async () => {
      if (!(await this.files.hasRecord(path))) {
        await this.files.store.remove(path);
        return;
      }
      const before = await this.files.store.read(path);
      if (before === null) {
        // Already gone: nothing is removed, so the record stays as it is.
        return;
      }
      await this.catchUp(path, before);
      await this.files.store.remove(path);
      await this.moveBaseline(path, before, null);
    });
  }

  /**
   * Takes in a change made outside Halonic since the file was last seen
   * (`app.review-outside-changes-merge`), so this write can move the
   * baseline on from it.
   */
  private async catchUp(path: string, current: string | null): Promise<void> {
    const record = await this.files.read(path);
    if (record !== null) {
      await catchUp(this.files, record, current);
    }
  }

  private async moveBaseline(
    path: string,
    before: string | null,
    after: string | null,
  ): Promise<void> {
    const record = await this.files.read(path);
    if (record === null) {
      return;
    }
    if ((await this.files.digestOf(before)) !== record.seen) {
      // The file changed outside Halonic before this write, in a way catch-up
      // couldn't take in. Merging from it would count that change as the
      // assistant's, so the record stays as it is and the file stays held for
      // Compare (AI changes 1.10).
      return;
    }
    const moved = await this.moved(record, before, after);
    if (moved === null) {
      await this.files.putRecord(path, null);
    } else {
      await this.files.keep(moved);
    }
    this.files.changed([path]);
  }

  /**
   * The record after a write from `before` to `after`: a three-way merge
   * with the file before as base, the baseline as ours and the file after
   * as theirs. Where they conflict, the write wins, so an edit inside one
   * of the assistant's changes takes it over. Changes that only touch don't
   * conflict, as in catch-up, so an edit on the line next to one of the
   * assistant's changes keeps that change to review. A write that creates or
   * deletes the whole file, or edits a file the assistant created, is the
   * person's decision on all of it, so the baseline becomes the file and the
   * record goes.
   *
   * @returns the moved record, or `null` when the record goes for good:
   *   emptying a file the assistant created takes its change back out, and
   *   the empty file is the person's own (HAL-3850)
   */
  private async moved(
    record: ReviewRecord,
    before: string | null,
    after: string | null,
  ): Promise<ReviewRecord | null> {
    if (before === null || after === null) {
      return this.files.seeing({ ...record, baseline: after }, after);
    }
    if (record.baseline === null) {
      if (after === "") {
        return null;
      }
      // A write that changes nothing leaves the file new.
      const baseline = after === before ? null : after;
      return this.files.seeing({ ...record, baseline }, after);
    }
    const regions = mergeLines(before, record.baseline, after, { touchingConflicts: false });
    return this.files.seeing({ ...record, baseline: mergedText(regions, "theirs") }, after);
  }
}
