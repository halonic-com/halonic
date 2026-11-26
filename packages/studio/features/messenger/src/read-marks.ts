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
 * connected to two workspaces shares them. Every window (the Messenger's, quick ask's) has its own
 * copy, so each change reads the key again first and changes only its own entries: one window's
 * older copy never overwrites another's newer marks. Without storage, or with storage that throws,
 * they last as long as this page; a failed write is logged.
 *
 * @example
 * const marks = new StoredReadMarks(globalThis.localStorage ?? null);
 * marks.set(chat.source, chat.id, message.sentAt);
 */
export class StoredReadMarks implements ReadMarks {
  readonly #storage: ReadMarkStorage | null;
  /** Each source's marks as this page last read or wrote them. */
  readonly #sources = new Map<MessagingId, Map<MessagingId, string>>();
  /** The sources whose last write failed: their marks live only in this page until one lands. */
  readonly #unsaved = new Set<MessagingId>();

  constructor(storage: ReadMarkStorage | null) {
    this.#storage = storage;
  }

  of(source: MessagingId, conversation: MessagingId): string | undefined {
    const known = this.#sources.get(source) ?? this.#fresh(source);
    return known.get(conversation);
  }

  set(source: MessagingId, conversation: MessagingId, sentAt: string): void {
    const marks = this.#fresh(source);
    if (marks.get(conversation) === sentAt) return;
    marks.set(conversation, sentAt);
    this.#write(source, marks);
  }

  keepOnly(source: MessagingId, conversations: readonly MessagingId[]): void {
    const marks = this.#fresh(source);
    const listed = new Set(conversations);
    const gone = [...marks.keys()].filter((conversation) => !listed.has(conversation));
    if (gone.length === 0) return;
    for (const conversation of gone) marks.delete(conversation);
    this.#write(source, marks);
  }

  /** A source's marks as another window may have just written them, now this page's copy. */
  #fresh(source: MessagingId): Map<MessagingId, string> {
    const known = this.#sources.get(source);
    // Storage that refused the last write holds older marks than this page.
    if (known !== undefined && this.#unsaved.has(source)) return known;
    const marks = new Map(this.#read(source) ?? known ?? []);
    this.#sources.set(source, marks);
    return marks;
  }

  /** The source's marks in storage; none without storage or when they can't be read. */
  #read(source: MessagingId): readonly (readonly [MessagingId, string])[] | undefined {
    if (this.#storage === null) return undefined;
    try {
      const kept: unknown = JSON.parse(this.#storage.getItem(keyPrefix + source) ?? "{}");
      if (typeof kept !== "object" || kept === null) return [];
      return Object.entries(kept).filter(
        (entry): entry is [MessagingId, string] => typeof entry[1] === "string",
      );
    } catch (error) {
      console.error("Couldn't read the Messenger's read marks; the chats count as unread.", error);
      return undefined;
    }
  }

  #write(source: MessagingId, marks: ReadonlyMap<MessagingId, string>): void {
    try {
      this.#storage?.setItem(keyPrefix + source, JSON.stringify(Object.fromEntries(marks)));
      this.#unsaved.delete(source);
    } catch (error) {
      this.#unsaved.add(source);
      console.error("Couldn't keep the Messenger's read marks on this device.", error);
    }
  }
}
