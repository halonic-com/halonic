import type { MessagingId } from "@halonicjs/ports";

/** Where the box's memory is kept: the page's `localStorage` in the app, shared by every window. */
export interface AskStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** A question sent from the box whose answer the box hasn't shown yet. */
export interface PendingAsk {
  /** The 1:1 chat it went to. */
  readonly conversation: MessagingId;
  /** When it was sent, as ISO text: an agent's message after this is its answer. */
  readonly sentAt: string;
}

const agentKey = "halonic.quick-ask.agent";
const unsentKey = "halonic.quick-ask.unsent";
const pendingKey = "halonic.quick-ask.pending";

/**
 * What the quick-ask box remembers between opens (requirement `quick-ask.session`): the chat it
 * asked last, the text typed and not sent, and the question still waiting for an answer. It is
 * kept in the page's storage, not in memory, because the box's window is destroyed and made
 * again; storage that can't be read counts as empty, and storage that can't be written leaves the
 * box working for this open, so the memory never stops the person from asking.
 *
 * @example
 * const memory = new AskMemory(window.localStorage);
 * memory.setUnsent("Where are we with the release?");
 * memory.unsent(); // "Where are we with the release?"
 */
export class AskMemory {
  readonly #storage: AskStorage;

  constructor(storage: AskStorage) {
    this.#storage = storage;
  }

  /** The chat the person asked in last, or `undefined` before the first question. */
  lastAgent(): MessagingId | undefined {
    return this.#read(agentKey) ?? undefined;
  }

  /** Remembers the chat the person picked or asked in, for the next open. */
  setLastAgent(conversation: MessagingId): void {
    this.#write(agentKey, conversation);
  }

  /** The text typed in the box and not sent; empty when there is none. */
  unsent(): string {
    return this.#read(unsentKey) ?? "";
  }

  /** Keeps the box's text, so closing the box doesn't lose it. Empty text forgets it. */
  setUnsent(text: string): void {
    this.#write(unsentKey, text === "" ? undefined : text);
  }

  /** The question still waiting for an answer the box has shown, if any. */
  pending(): PendingAsk | undefined {
    const text = this.#read(pendingKey);
    return text === undefined ? undefined : parsePending(text);
  }

  /** Remembers the question just sent, or forgets the waiting one with `undefined`. */
  setPending(pending: PendingAsk | undefined): void {
    this.#write(pendingKey, pending === undefined ? undefined : JSON.stringify(pending));
  }

  #read(key: string): string | undefined {
    try {
      return this.#storage.getItem(key) ?? undefined;
    } catch (error: unknown) {
      console.error(`Quick ask couldn't read ${key}; it counts as empty:`, error);
      return undefined;
    }
  }

  #write(key: string, value: string | undefined): void {
    try {
      if (value === undefined) this.#storage.removeItem(key);
      else this.#storage.setItem(key, value);
    } catch (error: unknown) {
      console.error(`Quick ask couldn't save ${key}; it is kept for this open only:`, error);
    }
  }
}

/**
 * Storage kept in this object only, for a page without `localStorage` (tests, a server page):
 * the box then remembers only while its window lives.
 */
export function memoryStorage(): AskStorage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
    removeItem: (key) => {
      values.delete(key);
    },
  };
}

/** A saved {@link PendingAsk}, or `undefined` when the text isn't one. */
function parsePending(text: string): PendingAsk | undefined {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (typeof value !== "object" || value === null) return undefined;
  const { conversation, sentAt } = value as Record<string, unknown>;
  if (typeof conversation !== "string" || typeof sentAt !== "string") return undefined;
  return { conversation, sentAt };
}
