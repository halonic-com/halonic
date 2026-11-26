import type {
  Attachment,
  AttachmentRead,
  InboxItem,
  MessagingId,
  MessagingRefusal,
} from "@halonicjs/ports";
import { readAtMost, refusalFor } from "./avatars.ts";
import type { PaperclipIds } from "./ids.ts";
import { asRecords, field, type JsonRecord, text } from "./json.ts";
import type { PaperclipReader } from "./reader.ts";
import { isSafeSegment } from "./requests.ts";
import { bodyOf } from "./transport.ts";

/** The picture types read, matching what a card draws: no SVG, which can carry script. */
export const cardFileTypes: readonly string[] = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
];

/** The largest picture read, in bytes. */
export const cardFileMaxBytes = 10 * 1024 * 1024;

/** The most files one card lists. */
export const cardFilesMax = 20;

/** A file record with the fields a card needs, and the post it came with. */
interface Posted {
  readonly id: string;
  readonly post: string;
  readonly at: number;
  readonly record: JsonRecord;
}

/**
 * The files a card or approval made at `madeAt` shows (`paperclip-client.card-files`). Paperclip
 * links no file to a card, so the card gets the newest post with files on its task from strictly
 * before it was made: one comment's files, or one run's when they have no comment. Files posted
 * after the card, even in the same second, never count. At most {@link cardFilesMax}, oldest first.
 */
export function cardFilesOf(
  ids: PaperclipIds,
  task: string,
  records: readonly JsonRecord[],
  madeAt: string,
): Attachment[] {
  const made = Date.parse(madeAt);
  const before = records.flatMap((record) => postedOf(record) ?? []).filter(({ at }) => at < made);
  const newest = before.reduce<Posted | undefined>(
    (last, each) => (last === undefined || each.at > last.at ? each : last),
    undefined,
  );
  if (newest === undefined) return [];
  return before
    .filter(({ post }) => post === newest.post)
    .sort((left, right) => left.at - right.at)
    .slice(0, cardFilesMax)
    .map(({ id, record }) => ({
      id: ids.make("attachment", task, id),
      name: text(record, "originalFilename") ?? "file",
      type: text(record, "contentType") ?? "application/octet-stream",
      size: sizeOf(record),
    }));
}

/** A file record's ID, post and time, or `undefined` when it lacks an ID or a readable time. */
function postedOf(record: JsonRecord): Posted | undefined {
  const id = text(record, "id");
  const at = Date.parse(text(record, "createdAt") ?? "");
  if (id === undefined || Number.isNaN(at)) return undefined;
  const comment = text(record, "issueCommentId");
  const run = text(record, "originatingRunId");
  return { id, post: postOf(id, comment, run), at, record };
}

/** The post a file came with: its comment, else its run; a file with neither is a post by itself. */
function postOf(id: string, comment: string | undefined, run: string | undefined): string {
  if (comment !== undefined) return `comment:${comment}`;
  return run === undefined ? `file:${id}` : `run:${run}`;
}

function sizeOf(record: JsonRecord): number {
  const size = field(record, "byteSize");
  return typeof size === "number" && Number.isFinite(size) && size >= 0 ? size : 0;
}

/** Reads task `task`'s file records, as {@link PaperclipCardFiles.recordsOf} does. */
export type FilesOf = (task: string) => Promise<JsonRecord[]>;

/**
 * Lists the files of Paperclip tasks for cards and reads a listed picture's bytes. Only files the
 * last Inbox list gave a card can be read, each bound to its task, so a made-up or stale ID, or
 * one that names another task, is refused before any request.
 */
export class PaperclipCardFiles {
  readonly #reader: PaperclipReader;
  /** The files the last list gave a card: each one's ID to its task. */
  #listed = new Map<string, string>();

  constructor(reader: PaperclipReader) {
    this.#reader = reader;
  }

  /**
   * Task `task`'s file records. A task Paperclip has no file list for (gone, or a server without
   * files) has none; any other failure is thrown, as for the task's cards.
   */
  async recordsOf(task: string): Promise<JsonRecord[]> {
    const answer = await this.#reader.send("listTaskAttachments", { path: { task } });
    if (answer.kind === "failed" && answer.failure === "not-found") return [];
    return asRecords(bodyOf("listTaskAttachments", answer));
  }

  /** A reader of task file records for one Inbox list, which reads each task's files once. */
  oncePerList(): FilesOf {
    const read = new Map<string, Promise<JsonRecord[]>>();
    return (task) => {
      const known = read.get(task);
      if (known !== undefined) return known;
      const records = this.recordsOf(task);
      read.set(task, records);
      return records;
    };
  }

  /** Keeps the files of `items` as the ones that may be read, and forgets every other. */
  remember(ids: PaperclipIds, items: readonly InboxItem[]): void {
    const listed = new Map<string, string>();
    for (const attachment of items.flatMap((item) => item.attachments)) {
      const [task, file] = ids.read(attachment.id, "attachment") ?? [];
      if (task !== undefined && file !== undefined) listed.set(file, task);
    }
    this.#listed = listed;
  }

  /**
   * Reads a listed picture's bytes with the connection's key: a PNG, JPEG, GIF or WebP picture of
   * at most {@link cardFileMaxBytes}, by its stated length and by the bytes that came, whose
   * leading bytes match its stated type. Anything else is refused, the rest of its body unread.
   */
  async read(ids: PaperclipIds, attachment: MessagingId): Promise<AttachmentRead> {
    const [task, file] = ids.read(attachment, "attachment") ?? [];
    const known =
      task !== undefined && file !== undefined && isSafeSegment(task) && isSafeSegment(file);
    if (!known || this.#listed.get(file) !== task) return refused("not-found");
    let picture: AttachmentRead = refused("not-found");
    const answer = await this.#reader.send(
      "readAttachmentContent",
      { path: { attachment: file } },
      {
        accept: cardFileTypes.join(", "),
        read: async (_name, response) => {
          picture = await readPicture(response);
          return { kind: "ok", body: undefined };
        },
      },
    );
    return answer.kind === "failed" ? refused(refusalFor(answer.failure)) : picture;
  }
}

async function readPicture(response: Response): Promise<AttachmentRead> {
  const type = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() ?? "";
  if (!cardFileTypes.includes(type)) {
    await response.body?.cancel();
    return refused("unsupported-type");
  }
  // A missing or unreadable length is checked on the bytes alone.
  if (Number(response.headers.get("content-length")) > cardFileMaxBytes) {
    await response.body?.cancel();
    return refused("too-large");
  }
  let bytes: Uint8Array | undefined;
  try {
    bytes = await readAtMost(response, cardFileMaxBytes);
  } catch {
    // The line dropped partway through the body: as for a request that never got through.
    return refused("offline");
  }
  if (bytes === undefined) return refused("too-large");
  // The stated type alone could be wrong: the bytes must start as that type's pictures do.
  return typeOfBytes(bytes) === type
    ? { outcome: "read", bytes, type }
    : refused("unsupported-type");
}

/** The picture type `bytes` start as, or `undefined` for none of {@link cardFileTypes}. */
export function typeOfBytes(bytes: Uint8Array): string | undefined {
  const startsWith = (prefix: readonly number[], offset = 0) =>
    prefix.every((byte, index) => bytes[offset + index] === byte);
  const ascii = (word: string) => [...word].map((character) => character.charCodeAt(0));
  if (startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWith([0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(ascii("GIF87a")) || startsWith(ascii("GIF89a"))) return "image/gif";
  if (startsWith(ascii("RIFF")) && startsWith(ascii("WEBP"), 8)) return "image/webp";
  return undefined;
}

function refused(reason: MessagingRefusal): AttachmentRead {
  return { outcome: "refused", reason };
}
