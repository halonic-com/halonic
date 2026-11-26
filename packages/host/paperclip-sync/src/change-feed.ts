import type { MessagingId } from "@halonicjs/ports";

/** One reader of a {@link ChangeFeed}, with its own queue, so a slow reader misses nothing. */
class ChangeReader implements AsyncIterableIterator<MessagingId> {
  #queued: MessagingId[] = [];
  #waiting: ((result: IteratorResult<MessagingId>) => void) | undefined;
  #ended = false;
  readonly #onLeave: (reader: ChangeReader) => void;

  constructor(onLeave: (reader: ChangeReader) => void) {
    this.#onLeave = onLeave;
  }

  push(id: MessagingId): void {
    if (this.#ended) return;
    const waiting = this.#waiting;
    if (waiting === undefined) {
      this.#queued.push(id);
      return;
    }
    this.#waiting = undefined;
    waiting({ done: false, value: id });
  }

  next(): Promise<IteratorResult<MessagingId>> {
    const id = this.#queued.shift();
    if (id !== undefined) return Promise.resolve({ done: false, value: id });
    if (this.#ended) return Promise.resolve({ done: true, value: undefined });
    return new Promise((resolve) => {
      this.#waiting = resolve;
    });
  }

  /** The reader stopped, with `break` or `return`. */
  return(): Promise<IteratorResult<MessagingId>> {
    this.#ended = true;
    this.#queued = [];
    this.#waiting?.({ done: true, value: undefined });
    this.#waiting = undefined;
    this.#onLeave(this);
    return Promise.resolve({ done: true, value: undefined });
  }

  [Symbol.asyncIterator](): AsyncIterableIterator<MessagingId> {
    return this;
  }
}

/** Hands each changed source to every reader listening; nothing is kept for readers that come later. */
export class ChangeFeed {
  readonly #readers = new Set<ChangeReader>();

  /** A new reader; it ends when the reader stops. */
  listen(): AsyncIterableIterator<MessagingId> {
    const reader = new ChangeReader((left) => this.#readers.delete(left));
    this.#readers.add(reader);
    return reader;
  }

  push(id: MessagingId): void {
    for (const reader of this.#readers) reader.push(id);
  }
}
