import type { MessagingId } from "@halonicjs/ports";

/** The part of the page's `localStorage` the pins use. */
export type ChatPinStorage = Pick<Storage, "getItem" | "setItem">;

/** How many chats the person can pin (Sofia's flows on HAL-20673, line 22, her option A). */
export const pinLimit = 3;

/** The key the pins are kept under on this device. */
const pinsKey = "halonic.messenger.pins";

/** One pinned chat: its source and its id, since two sources can reuse an id. */
export interface PinnedChat {
  readonly source: MessagingId;
  readonly conversation: MessagingId;
}

/** What pinning a chat did: pinned it, or kept the pins as they were because they're full. */
export type PinResult = "pinned" | "full";

/**
 * The chats the person pinned to the top of the Messenger's list (`messenger.pinned-chats`), the
 * most recently pinned first. A port can stand in for it later without the screens changing.
 */
export interface ChatPins {
  /** The pinned chats, the most recently pinned first. */
  list(): readonly PinnedChat[];
  /**
   * Pins a chat first. Only pins whose chats aren't `isGone` count: with {@link pinLimit} of
   * those, the pins stay as they are and it says `full`; otherwise the new pin takes the place of
   * the oldest gone pin (a channel the person left, say), if there's no room for it.
   */
  pin(chat: PinnedChat, isGone?: (pin: PinnedChat) => boolean): PinResult;
  /** Unpins a chat; nothing happens when it isn't pinned. */
  unpin(chat: PinnedChat): void;
}

/**
 * Pins kept on this device, so they outlive a restart. Each change reads the key again first, so
 * one window's older copy never overwrites another's newer pins. Without storage, or with storage
 * that throws, they last as long as this page; a failed read or write is logged.
 *
 * @example
 * const pins = new StoredChatPins(globalThis.localStorage ?? null);
 * pins.pin({ source: chat.source, conversation: chat.id });
 */
export class StoredChatPins implements ChatPins {
  readonly #storage: ChatPinStorage | null;
  /** The pins as this page last read or wrote them. */
  #pins: readonly PinnedChat[] = [];

  constructor(storage: ChatPinStorage | null) {
    this.#storage = storage;
  }

  list(): readonly PinnedChat[] {
    return this.#fresh();
  }

  pin(chat: PinnedChat, isGone: (pin: PinnedChat) => boolean = () => false): PinResult {
    const pins = this.#fresh();
    if (pins.some((each) => same(each, chat))) return "pinned";
    if (pins.filter((each) => !isGone(each)).length >= pinLimit) return "full";
    // Fewer than the limit count, so a gone pin makes the room.
    const next = [chat, ...pins];
    while (next.length > pinLimit) next.splice(next.findLastIndex(isGone), 1);
    this.#write(next);
    return "pinned";
  }

  unpin(chat: PinnedChat): void {
    const pins = this.#fresh();
    const kept = pins.filter((each) => !same(each, chat));
    if (kept.length !== pins.length) this.#write(kept);
  }

  /** The pins as another window may have just written them, now this page's copy. */
  #fresh(): readonly PinnedChat[] {
    if (this.#storage === null) return this.#pins;
    try {
      const kept: unknown = JSON.parse(this.#storage.getItem(pinsKey) ?? "[]");
      this.#pins = Array.isArray(kept) ? kept.filter(isPinnedChat).slice(0, pinLimit) : [];
    } catch (error) {
      console.error("Couldn't read the Messenger's pinned chats; this page keeps its own.", error);
    }
    return this.#pins;
  }

  #write(pins: readonly PinnedChat[]): void {
    this.#pins = pins;
    try {
      this.#storage?.setItem(pinsKey, JSON.stringify(pins));
    } catch (error) {
      console.error("Couldn't keep the Messenger's pinned chats on this device.", error);
    }
  }
}

/** A row as {@link pinnedFirst} needs it: its chat's source and id. */
export interface PinnableRow {
  readonly conversation: { readonly source: MessagingId; readonly id: MessagingId };
}

/**
 * The rows split into the pinned ones, in pin order, and the others, in the order given (newest
 * first). A pin whose chat isn't listed shows nothing and keeps its place.
 */
export function pinnedFirst<Row extends PinnableRow>(
  rows: readonly Row[],
  pins: readonly PinnedChat[],
): { readonly pinned: readonly Row[]; readonly others: readonly Row[] } {
  const pinned = pins.flatMap((pin) => rows.filter((row) => isRowOf(row, pin)));
  const others = rows.filter((row) => !pinned.includes(row));
  return { pinned, others };
}

/** Whether a row is the pinned chat's. */
export function isRowOf(row: PinnableRow, pin: PinnedChat): boolean {
  return row.conversation.source === pin.source && row.conversation.id === pin.conversation;
}

function same(left: PinnedChat, right: PinnedChat): boolean {
  return left.source === right.source && left.conversation === right.conversation;
}

function isPinnedChat(value: unknown): value is PinnedChat {
  if (typeof value !== "object" || value === null) return false;
  const { source, conversation } = value as Record<string, unknown>;
  return typeof source === "string" && typeof conversation === "string";
}
