// The record of one file's changes to review (AI changes 1.1, HAL-3277):
// what it holds and how it is kept as JSON. The record keeps a baseline, not
// the changes themselves: they are worked out from the baseline and the file
// each time, so they never go stale as the person types.

import { isReservedPath } from "@halonicjs/format";
import type { Digest, ExpectedContent } from "@halonicjs/ports";
import { bytesToHex, encodeUtf8, err, isPlainObject, ok, type Result } from "@halonicjs/std";
import { isNeverWritten } from "./review-gate.ts";

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
  readonly seen: ExpectedContent;
  /**
   * The file's text as last seen, matching `seen`; left out when the file
   * is gone. It is the base for taking in a change made outside Halonic
   * (`app.review-outside-changes-merge`). A record from before it was kept
   * has none, so such a change stays held for Compare.
   */
  readonly seenText?: string;
  /** Set when the assistant deleted the file: its entry in the trash, to put it back from. */
  readonly trashed?: { readonly trashId: string };
  /**
   * Set when the assistant wrote the file while the workspace was untrusted.
   * Later writes keep it, so it goes only with the record: until then, Try
   * it uses the baseline for the whole file (`workspace.trust.untrusted-changes-held`).
   */
  readonly writtenUntrusted?: true;
}

/**
 * The name of a file's record in the records' store. The name is the
 * SHA-256 of the path, so a file `a` and a folder `a.json` can't clash, and
 * a deep path can't make the name too long for the file system.
 *
 * @throws RangeError for a path inside a reserved `.halonic/` folder, which has no workspace files to review
 */
export async function reviewRecordPath(path: string, digest: Digest): Promise<string> {
  if (isReservedPath(path)) {
    throw new RangeError(`No review record for ${JSON.stringify(path)}: it is Halonic's own data.`);
  }
  const hash = bytesToHex(await digest.sha256(encodeUtf8(path)));
  return `${hash}.json`;
}

/** A record as JSON, the way {@link parseReviewRecord} reads it back. */
export function serializeReviewRecord(record: ReviewRecord): string {
  const json = {
    format: reviewRecordFormat,
    path: record.path,
    baseline: record.baseline,
    card: { chatId: record.card.chatId, cardId: record.card.cardId },
    seen: record.seen,
    ...(record.seenText === undefined ? {} : { seenText: record.seenText }),
    ...(record.trashed === undefined ? {} : { trashed: { trashId: record.trashed.trashId } }),
    ...(record.writtenUntrusted === true ? { writtenUntrusted: true } : {}),
  };
  return `${JSON.stringify(json, null, 2)}\n`;
}

const digestPattern = /^sha256:[0-9a-f]{64}$/u;

/** Whether a record's `seen` is a `contentDigest` or `"absent"`. */
function isSeenDigest(seen: unknown): seen is ExpectedContent {
  return typeof seen === "string" && (seen === "absent" || digestPattern.test(seen));
}

/**
 * Reads a record that {@link serializeReviewRecord} wrote, checking every
 * field, because a person or a sync tool may have changed the file.
 *
 * @returns the record, or what is wrong with it
 */
export function parseReviewRecord(text: string): Result<ReviewRecord, string> {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return err("it isn't valid JSON");
  }
  if (!isPlainObject(json)) {
    return err("it isn't a JSON object");
  }
  const { format, path, baseline, card: cardJson, seen } = json;
  if (format !== reviewRecordFormat) {
    return err(`its format isn't ${reviewRecordFormat}`);
  }
  if (!isReviewablePath(path)) {
    return err("its path isn't a workspace file");
  }
  if (typeof baseline !== "string" && baseline !== null) {
    return err("its baseline isn't text or null");
  }
  const card = readCard(cardJson);
  if (card === null) {
    return err("its card has no chatId and cardId");
  }
  if (!isSeenDigest(seen)) {
    return err("its seen digest isn't a sha256 digest or absent");
  }
  const optional = readOptionalFields(json, seen);
  if (!optional.ok) {
    return optional;
  }
  return ok({ path, baseline, card, seen, ...optional.value });
}

/** The fields a record has only sometimes. */
type OptionalFields = Pick<ReviewRecord, "seenText" | "trashed" | "writtenUntrusted">;

/** Reads the fields of a record's JSON that may be left out, each only when it is there. */
function readOptionalFields(
  json: Record<string, unknown>,
  seen: ExpectedContent,
): Result<OptionalFields, string> {
  const { seenText, trashed, writtenUntrusted } = json;
  if (seenText !== undefined && (typeof seenText !== "string" || seen === "absent")) {
    return err("its seenText isn't the text of a file that exists");
  }
  if (writtenUntrusted !== undefined && writtenUntrusted !== true) {
    return err("its writtenUntrusted isn't true");
  }
  const fields: OptionalFields = {
    ...(typeof seenText === "string" ? { seenText } : {}),
    ...(writtenUntrusted === true ? { writtenUntrusted } : {}),
  };
  if (trashed === undefined) {
    return ok(fields);
  }
  const trashId = isPlainObject(trashed) ? trashed["trashId"] : undefined;
  if (typeof trashId !== "string" || trashId === "") {
    return err("its trashed entry has no trashId");
  }
  return ok({ ...fields, trashed: { trashId } });
}

/** Whether a value from a record is a path the review service could have written a record for. */
function isReviewablePath(path: unknown): path is string {
  return typeof path === "string" && !isNeverWritten(path);
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
