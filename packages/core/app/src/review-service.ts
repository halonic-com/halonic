// The chat assistant's changes to review (AI changes 1, HAL-3277): the
// assistant writes straight into the workspace, and the person accepts or
// rejects what it wrote. Accept changes only the record; Reject writes the
// baseline back. Nothing here commits, pushes or makes anything live.

import { ReviewFiles, type ReviewServiceOptions } from "./review-files.ts";
import { type FileWriter, ReviewWriteHook } from "./review-hook.ts";
import { decidePart, fileReview } from "./review-parts.ts";
import { proposeDelete, proposeWrite, sameCard } from "./review-propose.ts";
import type { ReviewCard, ReviewRecord } from "./review-record.ts";
import type {
  FileReview,
  ItemToReview,
  ProposedDelete,
  ProposedWrite,
  ProposeOutcome,
  ReviewCheck,
  ReviewedFile,
  ReviewOutcome,
  ReviewStep,
  ReviewTarget,
} from "./review-types.ts";

export type { ReviewServiceOptions } from "./review-files.ts";

type FileDecision = (record: ReviewRecord) => Promise<ReviewedFile | "held">;

/** The targets that cover whole files. */
type FilesTarget = Exclude<ReviewTarget, { kind: "part" }>;

/**
 * The assistant's changes to review in one workspace. Each file with
 * changes to review has a record with its baseline: the file with every
 * open assistant change rejected. The changes are always the difference
 * between the baseline and the file, so they never go stale as the person
 * types.
 *
 * Work on one file runs one at a time, so a write and an Accept can't
 * interleave.
 *
 * @example
 * const review = new ReviewService({ store, digest });
 * await review.propose({ path, content, expected, card: { chatId: "c1", cardId: "k1" } });
 * const { step } = await review.reject({ kind: "card", card: { chatId: "c1", cardId: "k1" } });
 * await review.restore(step, "before"); // Undo
 */
export class ReviewService {
  private readonly files: ReviewFiles;

  /**
   * The write hook (`app.review-other-writes-merge`): give it to the
   * workspace's `ReviewingDefinitionStore`, so every other write to a file
   * with changes to review moves its baseline along.
   */
  readonly writer: FileWriter;

  constructor(options: ReviewServiceOptions) {
    this.files = new ReviewFiles(options);
    this.writer = new ReviewWriteHook(this.files);
  }

  /**
   * Calls `listener` with the files whose record changed, after every write,
   * Accept, Reject, restore and check that changed one, so the item bar, the
   * Changes rows and the chat cards update without asking again.
   *
   * @returns a function that removes the listener
   */
  onDidChange(listener: (paths: readonly string[]) => void): () => void {
    return this.files.onDidChange(listener);
  }

  /**
   * Writes the assistant's text into the file (`app.review-assistant-writes`).
   * The first write keeps the text from before it as the baseline; later
   * writes keep the baseline.
   */
  propose(write: ProposedWrite): Promise<ProposeOutcome> {
    return proposeWrite(this.files, write);
  }

  /**
   * Moves the file the assistant deletes to the trash and records it
   * (`app.review-deletes-and-new-files`). Reject puts it back; Accept
   * leaves it in the trash.
   */
  proposeDelete(remove: ProposedDelete): Promise<ProposeOutcome> {
    return proposeDelete(this.files, remove);
  }

  /**
   * Accepts what the target covers. The files aren't touched: for a part
   * the baseline takes it over; for whole files the baseline becomes the
   * file, so the record goes.
   */
  accept(target: ReviewTarget): Promise<ReviewOutcome> {
    if (target.kind === "part") {
      return decidePart(this.files, target, "accept");
    }
    return this.decide(target, async (record) => {
      await this.files.putRecord(record.path, null);
      return { path: record.path, record: { before: record, after: null } };
    });
  }

  /**
   * Rejects what the target covers: the baseline's lines go back into the
   * file for a part, and each whole file gets its baseline back (a file the
   * assistant created is removed) and loses its record. A file that changed
   * outside Halonic since it was last seen is left alone and listed in `held`.
   */
  reject(target: ReviewTarget): Promise<ReviewOutcome> {
    if (target.kind === "part") {
      return decidePart(this.files, target, "reject");
    }
    return this.decide(target, async (record) => {
      const current = await this.files.store.read(record.path);
      if (!(await this.files.putBaseline(record))) {
        return "held";
      }
      await this.files.putRecord(record.path, null);
      return {
        path: record.path,
        record: { before: record, after: null },
        file: { before: current, after: record.baseline },
      };
    });
  }

  /**
   * Puts the files and records of a step back as they were `before` it
   * (Undo) or `after` it (Redo). A file that changed since the step is
   * left alone and listed in `held`, with its record.
   */
  async restore(step: ReviewStep, to: "before" | "after"): Promise<ReviewOutcome> {
    const from = to === "before" ? "after" : "before";
    const files = to === "before" ? [...step.files].reverse() : step.files;
    const done: ReviewedFile[] = [];
    const held: string[] = [];
    for (const entry of files) {
      const restored = await this.files.turn(entry.path, async () => {
        if (entry.file !== undefined) {
          const expected = await this.files.digestOf(entry.file[from]);
          if (!(await this.files.putFile(entry.path, expected, entry.file[to]))) {
            return false;
          }
        }
        await this.files.putRecord(entry.path, entry.record[to]);
        return true;
      });
      if (restored) {
        done.push(swapSides(entry, to));
      } else {
        held.push(entry.path);
      }
    }
    this.files.changed(done.map((file) => file.path));
    return { status: "done", step: { files: done }, held };
  }

  /**
   * The changes to review in one file (`app.review-changes-in`), worked
   * out from the saved file, or from `current`, the editor's unsaved text,
   * while the person types. `null` for a file without changes to review.
   */
  async changesIn(path: string, current?: string): Promise<FileReview | null> {
    const record = await this.files.read(path);
    if (record === null) {
      return null;
    }
    const text = current ?? (await this.files.store.read(path));
    return fileReview(this.files, record, text);
  }

  /** The changes to review in each file one chat card covers, sorted by path, for the card. */
  async changesForCard(card: ReviewCard): Promise<readonly FileReview[]> {
    const reviews: FileReview[] = [];
    for (const path of await this.pathsOf({ kind: "card", card })) {
      const review = await this.changesIn(path);
      if (review !== null) {
        reviews.push(review);
      }
    }
    return reviews;
  }

  /**
   * The files with changes to review, sorted by path, with the card each
   * belongs to (`app.review-items-to-review`). Create version leaves them
   * out, and Changes marks their rows.
   */
  async itemsWithChangesToReview(): Promise<readonly ItemToReview[]> {
    const { records } = await this.files.list();
    return records.map(({ path, card }) => ({ path, card }));
  }

  /**
   * Compares each file with its record, when the workspace opens or the
   * watcher reports files changed outside Halonic (`app.review-on-open`).
   * A file that isn't as last seen is held for Compare: its file and record
   * stay as they are. A record that can't be read is removed.
   *
   * @param paths - only these files, as a watch batch names them; all files when left out
   */
  async check(paths?: readonly string[]): Promise<ReviewCheck> {
    const { records, dropped } = await this.files.list(paths);
    const held: string[] = [];
    for (const record of records) {
      const seen = await this.files.turn(record.path, async () =>
        this.files.digestOf(await this.files.store.read(record.path)),
      );
      if (seen !== record.seen) {
        held.push(record.path);
      }
    }
    this.files.changed(dropped.flatMap(({ path }) => (path === null ? [] : [path])));
    return { held, dropped };
  }

  /** Runs a decision on every file the target covers, each in its file's turn. */
  private async decide(target: FilesTarget, decision: FileDecision): Promise<ReviewOutcome> {
    const done: ReviewedFile[] = [];
    const held: string[] = [];
    for (const path of await this.pathsOf(target)) {
      const result = await this.files.turn(path, async () => {
        const record = await this.files.read(path);
        return record === null ? null : decision(record);
      });
      if (result === "held") {
        held.push(path);
      } else if (result !== null) {
        done.push(result);
      }
    }
    this.files.changed(done.map((file) => file.path));
    return { status: "done", step: { files: done }, held };
  }

  private async pathsOf(target: FilesTarget): Promise<string[]> {
    if (target.kind === "file") {
      return [target.path];
    }
    const { records } = await this.files.list();
    return records
      .filter((record) =>
        target.kind === "card"
          ? sameCard(record.card, target.card)
          : record.card.chatId === target.chatId,
      )
      .map((record) => record.path);
  }
}

/** The entry for the step a restore made: what was `to` is now its `after`. */
function swapSides(entry: ReviewedFile, to: "before" | "after"): ReviewedFile {
  if (to === "after") {
    return entry;
  }
  const record = { before: entry.record.after, after: entry.record.before };
  if (entry.file === undefined) {
    return { path: entry.path, record };
  }
  return { path: entry.path, record, file: { before: entry.file.after, after: entry.file.before } };
}
