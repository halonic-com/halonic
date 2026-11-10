// The record of one file's changes to review (AI changes 1.1, HAL-3277):
// what it holds and how it is kept as JSON. The record keeps a baseline, not
// the changes themselves: they are worked out from the baseline and the file
// each time, so they never go stale as the person types.

import { isReservedPath } from "@halonicjs/format";
import { err, isPlainObject, ok, type Result } from "@halonicjs/std";

/** Where the records live in the workspace. It is inside the reserved `.halonic/` folder, so the loader skips it. */
export const reviewRecordFolder = ".halonic/review/files";

/** The version of the record's JSON. A record of another version counts as unreadable. */
const reviewRecordFormat = 1;

/** The chat card that last wrote a file. A newer card from another chat takes over the whole file. */
export interface ReviewCard {
  readonly chatId: string;
  readonly cardId: string;
}

/** The record of one file with changes to review. */
export interface ReviewRecord {
  /** The file it is about, relative to the workspace root. */
  readonly path: string;
  /** The file as it would be with every open assistant change rejected; `null` for a file the assistant created. */
  readonly baseline: string | null;
  /** The card that last wrote the file. */
  readonly card: ReviewCard;
  /**
   * The file as last seen: `contentDigest` of its text, or `"absent"` when
   * it was deleted. A file that no longer matches was changed outside Halonic.
   */
  readonly seen: string;
  /** Set when the assistant deleted the file: its entry in the trash, to put it back from. */
  readonly trashed?: { readonly trashId: string };
}

/**
 * Where the record of a file lives: its path under
 * {@link reviewRecordFolder}, with `.json` added.
 *
 * @throws RangeError for a path inside a reserved `.halonic/` folder, which has no workspace files to review
 */
export function reviewRecordPath(path: string): string {
  if (isReservedPath(path)) {
    throw new RangeError(`No review record for ${JSON.stringify(path)}: it is Halonic's own data.`);
  }
  return `${reviewRecordFolder}/${path}.json`;
}

/**
 * The file a record path is about, or `null` for a path that can't be a
 * record (a stray file in the folder).
 */
export function reviewedPath(recordPath: string): string | null {
  const prefix = `${reviewRecordFolder}/`;
  if (!recordPath.startsWith(prefix) || !recordPath.endsWith(".json")) {
    return null;
  }
  const path = recordPath.slice(prefix.length, -".json".length);
  if (path === "" || path.endsWith("/") || isReservedPath(path)) {
    return null;
  }
  return path;
}

/** A record as JSON, the way {@link parseReviewRecord} reads it back. */
export function serializeReviewRecord(record: ReviewRecord): string {
  const json = {
    format: reviewRecordFormat,
    path: record.path,
    baseline: record.baseline,
    card: { chatId: record.card.chatId, cardId: record.card.cardId },
    seen: record.seen,
    ...(record.trashed === undefined ? {} : { trashed: { trashId: record.trashed.trashId } }),
  };
  return `${JSON.stringify(json, null, 2)}\n`;
}

const digestPattern = /^sha256:[0-9a-f]{64}$/u;

/**
 * Reads a record that {@link serializeReviewRecord} wrote, checking every
 * field, because a person or a sync tool may have changed the file.
 *
 * @param text - the record file's text
 * @param path - the file the record should be about, from where it lives
 * @returns the record, or what is wrong with it
 */
export function parseReviewRecord(text: string, path: string): Result<ReviewRecord, string> {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return err("it isn't valid JSON");
  }
  if (!isPlainObject(json)) {
    return err("it isn't a JSON object");
  }
  const { format, path: recordedPath, baseline, card: cardJson, seen, trashed } = json;
  if (format !== reviewRecordFormat) {
    return err(`its format isn't ${reviewRecordFormat}`);
  }
  if (recordedPath !== path) {
    return err(`it is about ${JSON.stringify(recordedPath)}, not ${JSON.stringify(path)}`);
  }
  if (typeof baseline !== "string" && baseline !== null) {
    return err("its baseline isn't text or null");
  }
  const card = readCard(cardJson);
  if (card === null) {
    return err("its card has no chatId and cardId");
  }
  if (typeof seen !== "string" || (seen !== "absent" && !digestPattern.test(seen))) {
    return err("its seen digest isn't a sha256 digest or absent");
  }
  const record: ReviewRecord = { path, baseline, card, seen };
  if (trashed === undefined) {
    return ok(record);
  }
  const trashId = isPlainObject(trashed) ? trashed["trashId"] : undefined;
  if (typeof trashId !== "string" || trashId === "") {
    return err("its trashed entry has no trashId");
  }
  return ok({ ...record, trashed: { trashId } });
}

function readCard(value: unknown): ReviewCard | null {
  if (!isPlainObject(value)) {
    return null;
  }
  const { chatId, cardId } = value;
  if (typeof chatId !== "string" || chatId === "" || typeof cardId !== "string" || cardId === "") {
    return null;
  }
  return { chatId, cardId };
}
