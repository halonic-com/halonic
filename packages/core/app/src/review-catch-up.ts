// Catching a record up with a change made outside Halonic (AI changes 1.10,
// HAL-3964): another editor, `git pull` or a formatter changed a file with
// changes to review. A change that doesn't touch the assistant's moves the
// baseline along, as a person's save does; anything else stays held for
// Compare, because nobody outside Halonic decided on the assistant's change.

import { hasConflicts, mergedText, mergeLines } from "@halonicjs/std";
import type { ReviewFiles } from "./review-files.ts";
import type { ReviewRecord } from "./review-record.ts";

/**
 * Takes a change made outside Halonic into the record of a file
 * (`app.review-outside-changes-merge`), by a three-way merge with the file
 * as last seen as base, the baseline as ours and the file now as theirs.
 * Unlike a person's save, a conflict isn't settled: the outside change
 * overlaps the assistant's, so the record stays as it is and the file stays
 * held. So does a file created or deleted, as a whole, outside Halonic, and
 * a record that doesn't keep the text it last saw. Run it in the file's turn.
 *
 * @param record - the file's record, read in this turn
 * @param current - the file as it is now, `null` when it is gone
 * @returns the record now, `null` once nothing is left to review, or `"held"`
 */
export async function catchUp(
  files: ReviewFiles,
  record: ReviewRecord,
  current: string | null,
): Promise<ReviewRecord | null | "held"> {
  if ((await files.digestOf(current)) === record.seen) {
    return record;
  }
  const base = await lastSeenText(files, record);
  // Every line of a file the assistant created is its change, so any change
  // to it from outside overlaps one.
  if (base === null || current === null || record.baseline === null) {
    return "held";
  }
  // A change on the line next to one of the assistant's is taken in: there
  // is just one way to put them together, and the assistant's stays to review.
  const regions = mergeLines(base, record.baseline, current, { touchingConflicts: false });
  if (hasConflicts(regions)) {
    return "held";
  }
  const moved = { ...record, baseline: mergedText(regions, "ours") };
  // `keep` removes the record when the merge left nothing to review, as an
  // Accept or Reject of the last change does.
  const after = await files.keep(await files.seeing(moved, current));
  files.changed([record.path]);
  return after;
}

/**
 * The file's text as the record last saw it. `null` for a file that was
 * gone, for a record from before the text was kept, and for text that
 * doesn't match the digest, such as after a sync tool changed the record.
 */
async function lastSeenText(files: ReviewFiles, record: ReviewRecord): Promise<string | null> {
  const text = record.seenText;
  if (text === undefined || (await files.digestOf(text)) !== record.seen) {
    return null;
  }
  return text;
}
