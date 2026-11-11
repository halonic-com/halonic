// The assistant's `propose_file` and `propose_delete` (AI changes 1.1,
// HAL-3277): they change the workspace at once, and the record keeps what
// was there before, so the person can take it back. Both refuse the paths
// of HAL-65 section F, rules A and B, before they touch the store.

import type { ExpectedContent } from "@halonicjs/ports";
import { catchUp } from "./review-catch-up.ts";
import type { ReviewFiles } from "./review-files.ts";
import { proposalRefusal, refused, storeRefusing } from "./review-gate.ts";
import type { ReviewCard, ReviewRecord } from "./review-record.ts";
import type { ProposedDelete, ProposedWrite, ProposeOutcome } from "./review-types.ts";

/**
 * Writes the assistant's text into the file (`app.review-assistant-writes`).
 * The first write keeps the text from before it as the baseline; later
 * writes keep the baseline. A record that can't be read counts as none, so
 * the changes it covered become ordinary ones.
 */
export function proposeWrite(files: ReviewFiles, write: ProposedWrite): Promise<ProposeOutcome> {
  return inAllowedTurn(files, write.path, async (trusted) => {
    const checked = await checkBefore(files, write.path, write.expected);
    if (checked.status !== "ready") {
      return checked;
    }
    const { record, before } = checked;
    const written = await storeRefusing(() =>
      files.store.write(write.path, write.content, { expected: write.expected }),
    );
    if (written === refused) {
      return { status: "refused", reason: "not-allowed" };
    }
    if (written.status === "changed-on-disk") {
      return written;
    }
    const after = await files.keep({
      ...recordFields(record, before, trusted),
      path: write.path,
      card: write.card,
      ...(await files.lastSeen(write.content)),
    });
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
  return inAllowedTurn(files, remove.path, async (trusted) => {
    const checked = await checkBefore(files, remove.path, remove.expected);
    if (checked.status !== "ready") {
      return checked;
    }
    const { record, before } = checked;
    const moved = await storeRefusing(() =>
      files.trash().moveToTrash(remove.path, remove.expected),
    );
    if (moved === refused) {
      return { status: "refused", reason: "not-allowed" };
    }
    if (moved.status === "changed-on-disk") {
      return moved;
    }
    const fields = recordFields(record, before, trusted);
    const deleted: ReviewRecord = {
      ...fields,
      path: remove.path,
      card: remove.card,
      seen: "absent",
    };
    const after = await files.keep(
      fields.baseline === before ? { ...deleted, trashed: { trashId: moved.trashId } } : deleted,
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

/** Whether two cards are the same card of the same chat. */
export function sameCard(one: ReviewCard, other: ReviewCard): boolean {
  return one.chatId === other.chatId && one.cardId === other.cardId;
}

/**
 * Runs `work` in the file's turn when the assistant may change `path`
 * (`app.assistant-no-git-or-halonic`, `app.assistant-untrusted-items-only`).
 * Trust is read in the turn, not when the work is queued: work waiting
 * behind another on the same file must see trust as it is when it runs.
 * The check is synchronous, so a refusal touches no store.
 */
function inAllowedTurn(
  files: ReviewFiles,
  path: string,
  work: (trusted: boolean) => Promise<ProposeOutcome>,
): Promise<ProposeOutcome> {
  return files.turn(path, () => {
    const trusted = files.isTrusted();
    const refusal = proposalRefusal(path, trusted);
    if (refusal !== null) {
      return Promise.resolve({ status: "refused", reason: refusal });
    }
    return work(trusted);
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
 * Whether the assistant may change the file: the store must serve the
 * path, the file must hold what the model read, and, with a record, what
 * Halonic last saw, once a change from outside is caught up
 * (`app.review-outside-changes-merge`; else it waits for Compare).
 */
async function checkBefore(
  files: ReviewFiles,
  path: string,
  expected: ExpectedContent,
): Promise<CheckedBefore> {
  const before = await storeRefusing(() => files.store.read(path));
  if (before === refused) {
    return { status: "refused", reason: "not-allowed" };
  }
  const found = await files.read(path);
  if ((await files.digestOf(before)) !== expected) {
    return { status: "changed-on-disk", current: before };
  }
  // A change made outside Halonic is taken in first, as before a person's
  // save; one that touches the assistant's holds the file for Compare.
  const record = found === null ? null : await catchUp(files, found, before);
  if (record === "held") {
    return { status: "held" };
  }
  return { status: "ready", record, before };
}

/**
 * The fields a write or delete carries over: the first change's text from
 * before stays the baseline, and the untrusted mark, once set, stays until
 * the record goes (`app.untrusted-changes-held`).
 */
function recordFields(
  record: ReviewRecord | null,
  before: string | null,
  trusted: boolean,
): Pick<ReviewRecord, "baseline" | "writtenUntrusted"> {
  const baseline = record === null ? before : record.baseline;
  const writtenUntrusted = !trusted || record?.writtenUntrusted === true;
  return writtenUntrusted ? { baseline, writtenUntrusted } : { baseline };
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
