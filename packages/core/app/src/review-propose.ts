// The assistant's `propose_file` and `propose_delete` (AI changes 1.1,
// HAL-3277): they change the workspace at once, and the record keeps what
// was there before, so the person can take it back.

import type { ExpectedContent } from "@halonicjs/ports";
import type { ReviewFiles } from "./review-files.ts";
import type { ReviewCard, ReviewRecord } from "./review-record.ts";
import type { ProposedDelete, ProposedWrite, ProposeOutcome } from "./review-types.ts";

/**
 * Writes the assistant's text into the file (`app.review-assistant-writes`).
 * The first write keeps the text from before it as the baseline; later
 * writes keep the baseline. A record that can't be read counts as none, so
 * the changes it covered become ordinary ones.
 */
export function proposeWrite(files: ReviewFiles, write: ProposedWrite): Promise<ProposeOutcome> {
  return files.turn(write.path, async () => {
    const checked = await checkBefore(files, write.path, write.expected);
    if (checked.status !== "ready") {
      return checked;
    }
    const { record, before } = checked;
    const written = await files.store.write(write.path, write.content, {
      expected: write.expected,
    });
    if (written.status === "changed-on-disk") {
      return written;
    }
    const baseline = record === null ? before : record.baseline;
    const seen = await files.digestOf(write.content);
    const after = await files.keep({ path: write.path, baseline, card: write.card, seen });
    return writtenOutcome(
      files,
      record,
      after,
      { path: write.path, before, after: write.content },
      write.card,
    );
  });
}

/**
 * Moves the file the assistant deletes into Halonic's trash
 * (`app.review-deletes-and-new-files`), and records it with its baseline.
 * The record names the trash entry only when the trash holds the baseline
 * itself, so Reject can take it back from there.
 */
export function proposeDelete(files: ReviewFiles, remove: ProposedDelete): Promise<ProposeOutcome> {
  return files.turn(remove.path, async () => {
    const checked = await checkBefore(files, remove.path, remove.expected);
    if (checked.status !== "ready") {
      return checked;
    }
    const { record, before } = checked;
    const moved = await files.trash().moveToTrash(remove.path, remove.expected);
    if (moved.status === "changed-on-disk") {
      return moved;
    }
    const baseline = record === null ? before : record.baseline;
    const deleted: ReviewRecord = {
      path: remove.path,
      baseline,
      card: remove.card,
      seen: "absent",
    };
    const after = await files.keep(
      baseline === before ? { ...deleted, trashed: { trashId: moved.trashId } } : deleted,
    );
    return writtenOutcome(
      files,
      record,
      after,
      { path: remove.path, before, after: null },
      remove.card,
    );
  });
}

type CheckedBefore =
  | {
      readonly status: "ready";
      readonly record: ReviewRecord | null;
      readonly before: string | null;
    }
  | Exclude<ProposeOutcome, { status: "written" }>;

/**
 * Whether the assistant may change the file: it must hold what the model
 * read, and, with a record, what Halonic last saw (else it waits for Compare).
 */
async function checkBefore(
  files: ReviewFiles,
  path: string,
  expected: ExpectedContent,
): Promise<CheckedBefore> {
  const record = await files.read(path);
  const before = await files.store.read(path);
  const digestBefore = await files.digestOf(before);
  if (digestBefore !== expected) {
    return { status: "changed-on-disk", current: before };
  }
  if (record !== null && record.seen !== digestBefore) {
    return { status: "held" };
  }
  return { status: "ready", record, before };
}

/** The outcome of a write or delete that happened, as one undo step. */
function writtenOutcome(
  files: ReviewFiles,
  before: ReviewRecord | null,
  after: ReviewRecord | null,
  file: { path: string; before: string | null; after: string | null },
  card: ReviewCard,
): ProposeOutcome {
  files.changed([file.path]);
  const replaced = before !== null && !sameCard(before.card, card) ? before.card : null;
  const reviewed = {
    path: file.path,
    record: { before, after },
    file: { before: file.before, after: file.after },
  };
  return { status: "written", step: { files: [reviewed] }, replaced };
}

/** Whether two cards are the same card of the same chat. */
export function sameCard(one: ReviewCard, other: ReviewCard): boolean {
  return one.chatId === other.chatId && one.cardId === other.cardId;
}
