// The parts of a file's changes to review (AI changes 1.2, HAL-3277): the
// line changes from its baseline to the file, worked out fresh each time,
// and Accept or Reject of one of them.

import { applyLineChanges, diffLines } from "@halonicjs/std";
import type { ReviewFiles } from "./review-files.ts";
import type { ReviewRecord } from "./review-record.ts";
import type { FileReview, ReviewedFile, ReviewOutcome, ReviewTarget } from "./review-types.ts";

type PartTarget = Extract<ReviewTarget, { kind: "part" }>;

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
 * Accepts or rejects one part (`app.review-accept-reject-part`). Accept
 * applies it to the baseline and leaves the file alone; Reject writes the
 * file as the baseline with every other part applied. It is `stale` when
 * the file no longer holds the text the parts were worked out from.
 */
export function decidePart(
  files: ReviewFiles,
  target: PartTarget,
  decision: "accept" | "reject",
): Promise<ReviewOutcome> {
  return files.turn(target.path, async () => {
    const stale: ReviewOutcome = { status: "stale", path: target.path };
    const record = await files.read(target.path);
    const current = await files.store.read(target.path);
    if (record === null || current === null || (await files.digestOf(current)) !== target.seen) {
      return stale;
    }
    if (record.seen !== target.seen) {
      return { status: "done", step: { files: [] }, held: [target.path] };
    }
    const baseline = record.baseline ?? "";
    const parts = diffLines(baseline, current);
    const part = parts[target.part];
    if (part === undefined) {
      return stale;
    }
    let decided: ReviewedFile | "held";
    if (decision === "accept") {
      decided = await acceptPart(files, record, applyLineChanges(baseline, [part]));
    } else {
      const otherParts = parts.filter((other) => other !== part);
      decided = await rejectPart(files, record, current, applyLineChanges(baseline, otherParts));
    }
    if (decided === "held") {
      return { status: "done", step: { files: [] }, held: [target.path] };
    }
    files.changed([target.path]);
    return { status: "done", step: { files: [decided] }, held: [] };
  });
}

async function acceptPart(
  files: ReviewFiles,
  record: ReviewRecord,
  baseline: string,
): Promise<ReviewedFile> {
  const after = await files.keep({ ...record, baseline });
  return { path: record.path, record: { before: record, after } };
}

async function rejectPart(
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
