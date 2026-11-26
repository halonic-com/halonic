import { type InboxItem, isRunItem } from "./inbox-items.ts";

/**
 * The key an item's read mark goes by. A run's item keeps its key when the run comes back to the
 * same step (`inbox.live`), so its mark also names since when it waits, as the Inbox's answers do:
 * the step waiting again is new again. Any other item goes by its key.
 */
export function readKey(item: InboxItem): string {
  return isRunItem(item) ? `${item.key}@${item.since}` : item.key;
}

/** The part of the page's `localStorage` the read marks use. */
export type ReadMarkStorage = Pick<Storage, "getItem" | "setItem">;

/** The one key the marks live under: item keys hold their run's or their source's id already. */
const storageKey = "halonic.inbox.read";

/**
 * How many marks stay at most, the newest kept. The Inbox has no workspace id, so marks of every
 * workspace share the key and none can be dropped for missing from one workspace's list; this
 * bound keeps the key from growing without end instead (failure-path guide, resource use).
 */
export const keptMarks = 1000;

/**
 * Which of the Inbox's items the person opened (`inbox.read-marks`), by read key (`readKey`): an
 * item of the Inbox's own, or one card of an agent's. A port can stand in for it later without the screens
 * changing.
 */
export interface ReadMarks {
  isRead(key: string): boolean;
  /** Marks the items read, as opening their row does. */
  markRead(keys: readonly string[]): void;
  /** Marks an item unread again, as **Mark as unread** does. */
  markUnread(key: string): void;
}

/**
 * Read marks kept on this device, so they outlive a restart. Every window (Studio's, Halonic
 * Inbox's) has its own copy, so each change reads the key again first and changes only its own
 * entries: one window's older copy never overwrites another's newer marks. Without storage, or
 * with storage that throws, they last as long as this page; a failed write is logged.
 *
 * @example
 * inbox.readMarks = new StoredReadMarks(globalThis.localStorage ?? null);
 * inbox.readMarks.markRead([readKey(item)]);
 */
export class StoredReadMarks implements ReadMarks {
  readonly #storage: ReadMarkStorage | null;
  readonly #now: () => Date;
  /** The marks as this page last read or wrote them: each key with when it was read. */
  #marks: Map<string, string> | undefined;
  /** The last write failed: the marks live only in this page until one lands. */
  #unsaved = false;

  constructor(storage: ReadMarkStorage | null, now: () => Date = () => new Date()) {
    this.#storage = storage;
    this.#now = now;
  }

  isRead(key: string): boolean {
    return (this.#marks ?? this.#fresh()).has(key);
  }

  markRead(keys: readonly string[]): void {
    const marks = this.#fresh();
    const unread = keys.filter((key) => !marks.has(key));
    if (unread.length === 0) return;
    const at = this.#now().toISOString();
    for (const key of unread) marks.set(key, at);
    this.#write(marks);
  }

  markUnread(key: string): void {
    const marks = this.#fresh();
    if (!marks.delete(key)) return;
    this.#write(marks);
  }

  /** The marks as another window may have just written them, now this page's copy. */
  #fresh(): Map<string, string> {
    // Storage that refused the last write holds older marks than this page.
    if (this.#marks !== undefined && this.#unsaved) return this.#marks;
    this.#marks = new Map(this.#read() ?? this.#marks ?? []);
    return this.#marks;
  }

  /** The marks in storage; none without storage or when they can't be read. */
  #read(): readonly (readonly [string, string])[] | undefined {
    if (this.#storage === null) return undefined;
    try {
      const kept: unknown = JSON.parse(this.#storage.getItem(storageKey) ?? "{}");
      if (typeof kept !== "object" || kept === null) return [];
      return Object.entries(kept).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string",
      );
    } catch (error) {
      console.error("Couldn't read the Inbox's read marks; its items count as new.", error);
      return undefined;
    }
  }

  #write(marks: Map<string, string>): void {
    const kept =
      marks.size > keptMarks
        ? new Map([...marks].sort((a, b) => b[1].localeCompare(a[1])).slice(0, keptMarks))
        : marks;
    this.#marks = kept;
    try {
      this.#storage?.setItem(storageKey, JSON.stringify(Object.fromEntries(kept)));
      this.#unsaved = false;
    } catch (error) {
      this.#unsaved = true;
      console.error("Couldn't keep the Inbox's read marks on this device.", error);
    }
  }
}
