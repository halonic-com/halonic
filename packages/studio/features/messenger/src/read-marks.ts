import type { MessagingId } from "@halonicjs/ports";

/** The part of the page's `localStorage` the read marks use. */
export type ReadMarkStorage = Pick<Storage, "getItem" | "setItem">;

/** The prefix of each source's key; the rest is the source's id. */
const keyPrefix = "halonic.messenger.read.";

/**
 * When the newest message the person read in each chat was sent (`messenger.read-marks`). A port
 * can stand in for it later without the screens changing.
 */
export interface ReadMarks {
  /** The time of the newest message read in a chat; none before the person opened it. */
  of(source: MessagingId, conversation: MessagingId): string | undefined;
  /** Moves a chat's mark to `sentAt`, back or forward. */
  set(source: MessagingId, conversation: MessagingId, sentAt: string): void;
  /** Drops the marks of a source's chats that aren't in `conversations` any more. */
  keepOnly(source: MessagingId, conversations: readonly MessagingId[]): void;
}

/**
 * Read marks kept on this device, one key per source, so they outlive a restart and a source
 * connected to two workspaces shares them. Without storage, or with storage that throws, they
 * last as long as this page; a failed write is logged.
 *
 * @example
 * const marks = new StoredReadMarks(globalThis.localStorage ?? null);
 * marks.set(chat.source, chat.id, message.sentAt);
 */
export class StoredReadMarks implements ReadMarks {
  readonly #storage: ReadMarkStorage | null;
  /** Each source's marks, read from storage once. */
  readonly #sources = new Map<MessagingId, Map<MessagingId, string>>();

  constructor(storage: ReadMarkStorage | null) {
    this.#storage = storage;
  }

  of(source: MessagingId, conversation: MessagingId): string | undefined {
    return this.#marksOf(source).get(conversation);
  }

  set(source: MessagingId, conversation: MessagingId, sentAt: string): void {
    const marks = this.#marksOf(source);
    if (marks.get(conversation) === sentAt) return;
    marks.set(conversation, sentAt);
    this.#write(source, marks);
  }

  keepOnly(source: MessagingId, conversations: readonly MessagingId[]): void {
    const marks = this.#marksOf(source);
    const listed = new Set(conversations);
    const gone = [...marks.keys()].filter((conversation) => !listed.has(conversation));
    if (gone.length === 0) return;
    for (const conversation of gone) marks.delete(conversation);
    this.#write(source, marks);
  }

  #marksOf(source: MessagingId): Map<MessagingId, string> {
    const known = this.#sources.get(source);
    if (known !== undefined) return known;
    const marks = new Map(this.#read(source));
    this.#sources.set(source, marks);
    return marks;
  }

  #read(source: MessagingId): readonly (readonly [MessagingId, string])[] {
    try {
      const kept: unknown = JSON.parse(this.#storage?.getItem(keyPrefix + source) ?? "{}");
      if (typeof kept !== "object" || kept === null) return [];
      return Object.entries(kept).filter(
        (entry): entry is [MessagingId, string] => typeof entry[1] === "string",
      );
    } catch (error) {
      console.error("Couldn't read the Messenger's read marks; the chats count as unread.", error);
      return [];
    }
  }

  #write(source: MessagingId, marks: ReadonlyMap<MessagingId, string>): void {
    try {
      this.#storage?.setItem(keyPrefix + source, JSON.stringify(Object.fromEntries(marks)));
    } catch (error) {
      console.error("Couldn't keep the Messenger's read marks on this device.", error);
    }
  }
}
