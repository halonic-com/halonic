// The parts of a file's changes to review (AI changes 1.2, HAL-3277): the
// line changes from its baseline to the file, worked out fresh each time,
// and Accept or Reject of one of them, or of one change on an item page.

import { applyLineChanges, diffLines } from "@halonicjs/std";
import { revertParts } from "./changes/revert-parts.ts";
import type { ReviewFiles } from "./review-files.ts";
import type { ReviewRecord } from "./review-record.ts";
import type { FileReview, ReviewedFile, ReviewOutcome, ReviewTarget } from "./review-types.ts";

type PartTarget = Extract<ReviewTarget, { kind: "part" }>;
type ChangeTarget = Extract<ReviewTarget, { kind: "change" }>;

/** The targets that cover some of one file's changes. */
export type InFileTarget = PartTarget | ChangeTarget;

/**
 * What a decision inside a file writes: the new baseline for Accept, the
 * new file for Reject. Or the outcome when there is nothing to write.
 */
type Decided = { readonly status: "text"; readonly text: string } | ReviewOutcome;

/**
 * The changes to review in a file with a record, worked out from `text`:
 * the file as saved, or the editor's unsaved text while the person types.
 */
export async function fileReview(
  files: ReviewFiles,
  record: ReviewRecord,
  text: string | null,
): Promise<FileReview> {
  return {
    path: record.path,
    card: record.card,
    baseline: record.baseline,
    seen: await files.digestOf(text),
    deleted: text === null,
    parts: text === null ? [] : diffLines(record.baseline ?? "", text),
  };
}

/**
 * Accepts or rejects one part (`app.review-accept-reject-part`) or one
 * change on an item page (`app.review-accept-reject-change`). Accept moves
 * the baseline and leaves the file alone; Reject writes the file and keeps
 * the baseline. It is `stale` when the file no longer holds the text the
 * target was worked out from.
 */
export function decideInFile(
  files: ReviewFiles,
  target: InFileTarget,
  decision: "accept" | "reject",
): Promise<ReviewOutcome> {
  return files.turn(target.path, async () => {
    const held: ReviewOutcome = { status: "done", step: { files: [] }, held: [target.path] };
    const record = await files.read(target.path);
    const current = await files.store.read(target.path);
    if (record === null || current === null || (await files.digestOf(current)) !== target.seen) {
      return { status: "stale", path: target.path };
    }
    if (record.seen !== target.seen) {
      return held;
    }
    const decided =
      target.kind === "part"
        ? decidedPart(record, current, target, decision)
        : decidedChange(record, current, target, decision);
    if (decided.status !== "text") {
      return decided;
    }
    const entry =
      decision === "accept"
        ? await acceptInFile(files, record, decided.text)
        : await rejectInFile(files, record, current, decided.text);
    if (entry === "held") {
      return held;
    }
    files.changed([target.path]);
    return { status: "done", step: { files: [entry] }, held: [] };
  });
}

/** For one part: Accept applies it to the baseline; Reject applies every other part to it. */
function decidedPart(
  record: ReviewRecord,
  current: string,
  target: PartTarget,
  decision: "accept" | "reject",
): Decided {
  const baseline = record.baseline ?? "";
  const parts = diffLines(baseline, current);
  const part = parts[target.part];
  if (part === undefined) {
    return { status: "stale", path: target.path };
  }
  const applied = decision === "accept" ? [part] : parts.filter((other) => other !== part);
  return { status: "text", text: applyLineChanges(baseline, applied) };
}

/**
 * For one change: Accept sets its parts in the baseline to the file's
 * values; Reject sets them in the file back to the baseline's. The rest of
 * each text, comments and formatting stay as they are.
 */
function decidedChange(
  record: ReviewRecord,
  current: string,
  target: ChangeTarget,
  decision: "accept" | "reject",
): Decided {
  const cantSeparate = (message: string): Decided => ({
    status: "cant-separate",
    path: target.path,
    message,
  });
  if (record.baseline === null) {
    return cantSeparate("The assistant created this file, so it is decided as a whole.");
  }
  if (target.parts.length === 0) {
    return cantSeparate("This change has no parts of its own.");
  }
  const reverted =
    decision === "accept"
      ? revertParts(record.baseline, current, target.parts)
      : revertParts(current, record.baseline, target.parts);
  if (!reverted.ok) {
    return cantSeparate(`The change couldn't be taken apart: ${reverted.error.message}`);
  }
  return { status: "text", text: reverted.value };
}

async function acceptInFile(
  files: ReviewFiles,
  record: ReviewRecord,
  baseline: string,
): Promise<ReviewedFile> {
  const after = await files.keep({ ...record, baseline });
  return { path: record.path, record: { before: record, after } };
}

async function rejectInFile(
  files: ReviewFiles,
  record: ReviewRecord,
  current: string,
  rejected: string,
): Promise<ReviewedFile | "held"> {
  // Rejecting the last part of a file the assistant created removes the file.
  const text = record.baseline === null && rejected === "" ? null : rejected;
  if (!(await files.putFile(record.path, record.seen, text))) {
    return "held";
  }
  const after = await files.keep(await files.seeing(record, text));
  return {
    path: record.path,
    record: { before: record, after },
    file: { before: current, after: text },
  };
}
