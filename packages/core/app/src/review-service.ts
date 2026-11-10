// The chat assistant's changes to review (AI changes 1, HAL-3277): the
// assistant writes straight into the workspace, and the person accepts or
// rejects what it wrote. Accept changes only the record; Reject writes the
// baseline back. Nothing here commits, pushes or makes anything live.

import type { DefinitionStore, ExpectedContent } from "@halonicjs/ports";
import { contentDigest, KeyedQueue, type Sha256 } from "@halonicjs/std";
import type { ReviewCard, ReviewRecord } from "./review-record.ts";
import { ReviewRecords } from "./review-records.ts";
import type {
  ItemToReview,
  ProposedWrite,
  ProposeOutcome,
  ReviewCheck,
  ReviewedFile,
  ReviewOutcome,
  ReviewStep,
  ReviewTarget,
} from "./review-types.ts";

/** What {@link ReviewService} needs from the host. */
export interface ReviewServiceOptions {
  /** The workspace's files. The records are kept in it too, under `.halonic/review/`. */
  readonly store: DefinitionStore;
  /** Hashes file text for the write-if-unchanged check. */
  readonly digest: Sha256;
}

type FileDecision = (record: ReviewRecord) => Promise<ReviewedFile | "held">;

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
  private readonly store: DefinitionStore;
  private readonly digest: Sha256;
  private readonly records: ReviewRecords;
  private readonly queue = new KeyedQueue();

  constructor(options: ReviewServiceOptions) {
    this.store = options.store;
    this.digest = options.digest;
    this.records = new ReviewRecords(options.store);
  }

  /**
   * Writes the assistant's text into the file (`app.review-assistant-writes`).
   * The first write keeps the text from before it as the baseline; later
   * writes keep the baseline. A record that can't be read is dropped first,
   * so the changes it covered become ordinary ones.
   */
  propose(write: ProposedWrite): Promise<ProposeOutcome> {
    return this.queue.run(write.path, async () => {
      const read = await this.records.read(write.path);
      const record = read.status === "found" ? read.record : null;
      const before = await this.store.read(write.path);
      const digestBefore = await this.digestOf(before);
      if (digestBefore !== write.expected) {
        return { status: "changed-on-disk", current: before };
      }
      if (record !== null && record.seen !== digestBefore) {
        return { status: "held" };
      }
      const written = await this.store.write(write.path, write.content, {
        expected: write.expected,
      });
      if (written.status === "changed-on-disk") {
        return written;
      }
      const baseline = record === null ? before : record.baseline;
      const after = await this.keep({
        path: write.path,
        baseline,
        card: write.card,
        seen: await this.digestOf(write.content),
      });
      const replaced = record !== null && !sameCard(record.card, write.card) ? record.card : null;
      const file = { before, after: write.content };
      return {
        status: "written",
        step: { files: [{ path: write.path, record: { before: record, after }, file }] },
        replaced,
      };
    });
  }

  /** Accepts what the target covers: the baseline becomes the file, so its record goes. The files aren't touched. */
  accept(target: ReviewTarget): Promise<ReviewOutcome> {
    return this.decide(target, async (record) => {
      await this.records.remove(record.path);
      return { path: record.path, record: { before: record, after: null } };
    });
  }

  /**
   * Rejects what the target covers: each file gets its baseline back (a
   * file the assistant created is removed), and its record goes. A file
   * that changed outside Halonic since it was last seen is left alone and
   * listed in `held`.
   */
  reject(target: ReviewTarget): Promise<ReviewOutcome> {
    return this.decide(target, async (record) => {
      const current = await this.store.read(record.path);
      const restored = await this.putFile(record.path, record.seen, record.baseline);
      if (!restored) {
        return "held";
      }
      await this.records.remove(record.path);
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
      const restored = await this.queue.run(entry.path, async () => {
        if (entry.file !== undefined) {
          const expected = await this.digestOf(entry.file[from]);
          if (!(await this.putFile(entry.path, expected, entry.file[to]))) {
            return false;
          }
        }
        await this.putRecord(entry.path, entry.record[to]);
        return true;
      });
      if (restored) {
        done.push(swapSides(entry, to));
      } else {
        held.push(entry.path);
      }
    }
    return { step: { files: done }, held };
  }

  /**
   * The files with changes to review, sorted by path, with the card each
   * belongs to (`app.review-items-to-review`). Create version leaves them
   * out, and Changes marks their rows.
   */
  async itemsWithChangesToReview(): Promise<readonly ItemToReview[]> {
    const { records } = await this.records.all();
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
    const { records, dropped } =
      paths === undefined ? await this.records.all() : await this.records.some(paths);
    const held: string[] = [];
    for (const record of records) {
      const seen = await this.queue.run(record.path, async () =>
        this.digestOf(await this.store.read(record.path)),
      );
      if (seen !== record.seen) {
        held.push(record.path);
      }
    }
    return { held, dropped };
  }

  /** Runs a decision on every file the target covers, each in its file's turn. */
  private async decide(target: ReviewTarget, decision: FileDecision): Promise<ReviewOutcome> {
    const done: ReviewedFile[] = [];
    const held: string[] = [];
    for (const path of await this.pathsOf(target)) {
      const result = await this.queue.run(path, async () => {
        const read = await this.records.read(path);
        return read.status === "found" ? decision(read.record) : null;
      });
      if (result === "held") {
        held.push(path);
      } else if (result !== null) {
        done.push(result);
      }
    }
    return { step: { files: done }, held };
  }

  private async pathsOf(target: ReviewTarget): Promise<string[]> {
    if (target.kind === "file") {
      return [target.path];
    }
    const { records } = await this.records.all();
    return records
      .filter((record) =>
        target.kind === "card"
          ? sameCard(record.card, target.card)
          : record.card.chatId === target.chatId,
      )
      .map((record) => record.path);
  }

  /** Saves a record, or removes it when the baseline is the file again: then nothing is left to review. */
  private async keep(record: ReviewRecord): Promise<ReviewRecord | null> {
    if (record.seen === (await this.digestOf(record.baseline))) {
      await this.records.remove(record.path);
      return null;
    }
    await this.records.save(record);
    return record;
  }

  private async putRecord(path: string, record: ReviewRecord | null): Promise<void> {
    if (record === null) {
      await this.records.remove(path);
    } else {
      await this.records.save(record);
    }
  }

  /**
   * Writes `text` into the file, or removes it for `null`, if it still
   * holds what `expected` says. Gives `false`, writing nothing, if not.
   */
  private async putFile(
    path: string,
    expected: ExpectedContent,
    text: string | null,
  ): Promise<boolean> {
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

  private async digestOf(text: string | null): Promise<ExpectedContent> {
    return text === null ? "absent" : contentDigest(text, this.digest);
  }
}

function sameCard(one: ReviewCard, other: ReviewCard): boolean {
  return one.chatId === other.chatId && one.cardId === other.cardId;
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
