// The chat assistant's changes to review (AI changes 1, HAL-3277): the
// assistant writes straight into the workspace, and the person accepts or
// rejects what it wrote. Accept changes only the record; Reject writes the
// baseline back. Nothing here commits, pushes or makes anything live.

import { catchUp } from "./review-catch-up.ts";
import { ReviewFiles, type ReviewServiceOptions } from "./review-files.ts";
import { type FileWriter, ReviewWriteHook } from "./review-hook.ts";
import { decideInFile, fileReview, type InFileTarget } from "./review-parts.ts";
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
  TryItSource,
} from "./review-types.ts";
import { buildTryItSource } from "./try-it-source.ts";

export type { ReviewServiceOptions } from "./review-files.ts";

type FileDecision = (record: ReviewRecord) => Promise<ReviewedFile | "held">;

/** The targets that cover whole files. */
type FilesTarget = Exclude<ReviewTarget, InFileTarget>;

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
 * const review = new ReviewService({ store, records, digest, isTrusted: () => trusted });
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
   * writes keep the baseline. A record that can't be read counts as none:
   * the text from before this write becomes the baseline and the new record
   * replaces the unreadable one, so the changes it covered become ordinary
   * ones. Its loss isn't reported apart from this write's own change.
   *
   * A path the assistant may never write, such as one in `.git/` or
   * `.halonic/` (`app.assistant-no-git-or-halonic`), or one that isn't a
   * Halonic item while the workspace is untrusted
   * (`app.assistant-untrusted-items-only`), is refused without touching the
   * store. So is a path the store refuses, such as one through a symlink.
   * Trust is read on every write, in the file's turn; a write while
   * untrusted marks the record `writtenUntrusted` until the record goes.
   */
  propose(write: ProposedWrite): Promise<ProposeOutcome> {
    return proposeWrite(this.files, write);
  }

  /**
   * Moves the file the assistant deletes to the trash and records it
   * (`app.review-deletes-and-new-files`). Reject puts it back; Accept
   * leaves it in the trash. The same paths are refused as for
   * {@link propose}, and trust is read the same way.
   */
  proposeDelete(remove: ProposedDelete): Promise<ProposeOutcome> {
    return proposeDelete(this.files, remove);
  }

  /**
   * Accepts what the target covers. The files aren't touched: for a part
   * or a change the baseline takes it over; for whole files the baseline
   * becomes the file, so the record goes. For a card or a chat, a record
   * that can't be read is removed without telling the listeners.
   */
  accept(target: ReviewTarget): Promise<ReviewOutcome> {
    if (isInFile(target)) {
      return decideInFile(this.files, target, "accept");
    }
    return this.decide(target, async (record) => {
      await this.files.putRecord(record.path, null);
      return { path: record.path, record: { before: record, after: null } };
    });
  }

  /**
   * Rejects what the target covers: the baseline's lines go back into the
   * file for a part, the baseline's values for a change, and each whole file gets its baseline back (a file the
   * assistant created is removed) and loses its record. A file that changed
   * outside Halonic since it was last seen is left alone and listed in
   * `held`. For a card or a chat, a record that can't be read is removed
   * without telling the listeners.
   */
  reject(target: ReviewTarget): Promise<ReviewOutcome> {
    if (isInFile(target)) {
      return decideInFile(this.files, target, "reject");
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
   * left alone and listed in `held`, with its record. That includes a
   * step that only changed the record, such as an Accept: its record comes
   * back only while the file is still as that record last saw it.
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
        } else if (!(await this.stillAsSeen(entry.path, entry.record[to]))) {
          return false;
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
   * Parts from unsaved text are for showing only: the baseline moves on
   * save, so Accept or Reject of one of them answers `stale`. Save before
   * deciding one.
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
   * out, and Changes marks their rows. A record that can't be read is
   * removed and left out, without telling the listeners.
   */
  async itemsWithChangesToReview(): Promise<readonly ItemToReview[]> {
    const { records } = await this.files.list();
    return records.map(({ path, card }) => ({ path, card }));
  }

  /**
   * What Try it and Test read while there are changes to review
   * (`app.review-try-it-holds-back`, `app.untrusted-changes-held`): the
   * workspace, with the baseline's value for a change's permissions, trust
   * and sandbox, connections, models and providers, and the whole baseline
   * for a file the assistant wrote while the workspace was untrusted, until
   * the person accepts them. `leftOut` counts what that leaves out.
   *
   * Built in memory, from the records as they are now: call it again on
   * {@link onDidChange}. It writes nothing, starts nothing and never reads
   * or changes trust.
   */
  tryItSource(): Promise<TryItSource> {
    return buildTryItSource(this.files);
  }

  /**
   * Compares each file with its record, when the workspace opens or the
   * watcher reports files changed outside Halonic (`app.review-on-open`).
   * A file that isn't as last seen is caught up when the change doesn't
   * touch the assistant's (`app.review-outside-changes-merge`), and held
   * for Compare otherwise: its file and record stay as they are. A record
   * that can't be read is removed.
   *
   * @param paths - only these files, as a watch batch names them; all files when left out
   */
  async check(paths?: readonly string[]): Promise<ReviewCheck> {
    const { records, dropped } = await this.files.list(paths);
    const held: string[] = [];
    for (const { path } of records) {
      // The record is read again in the file's turn: a save since the
      // listing may have moved it, and catching up from the old one would
      // undo that.
      const caught = await this.files.turn(path, async () => {
        const record = await this.files.read(path);
        return record === null
          ? null
          : catchUp(this.files, record, await this.files.store.read(path));
      });
      if (caught === "held") {
        held.push(path);
      }
    }
    this.files.changed(dropped.flatMap(({ path }) => (path === null ? [] : [path])));
    return { held, dropped };
  }

  /**
   * Runs a decision on every file the target covers, each in its file's
   * turn. The record is read again in that turn, and a file the target no
   * longer covers is skipped: a write for another card may have taken it
   * over since the files were listed.
   */
  private async decide(target: FilesTarget, decision: FileDecision): Promise<ReviewOutcome> {
    const done: ReviewedFile[] = [];
    const held: string[] = [];
    for (const path of await this.pathsOf(target)) {
      const result = await this.files.turn(path, async () => {
        const record = await this.files.read(path);
        return record === null || !covers(target, record) ? null : decision(record);
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
    return records.filter((record) => covers(target, record)).map((record) => record.path);
  }

  /** Whether the file is still as `record` last saw it; always for no record. */
  private async stillAsSeen(path: string, record: ReviewRecord | null): Promise<boolean> {
    return (
      record === null ||
      (await this.files.digestOf(await this.files.store.read(path))) === record.seen
    );
  }
}

function isInFile(target: ReviewTarget): target is InFileTarget {
  return target.kind === "part" || target.kind === "change";
}

/** Whether the target covers the file of `record`. */
function covers(target: FilesTarget, record: ReviewRecord): boolean {
  switch (target.kind) {
    case "file":
      return record.path === target.path;
    case "card":
      return sameCard(record.card, target.card);
    case "chat":
      return record.card.chatId === target.chatId;
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
