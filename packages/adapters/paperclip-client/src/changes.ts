/** One reader of {@link ChangeFeed}: its own queue, so a slow reader misses nothing. */
class Reader<T> implements AsyncIterableIterator<T> {
  #queued: T[] = [];
  #waiting: ((result: IteratorResult<T>) => void) | undefined;
  #ended = false;
  readonly #onLeave: (reader: Reader<T>) => void;

  constructor(onLeave: (reader: Reader<T>) => void) {
    this.#onLeave = onLeave;
  }

  push(item: T): void {
    if (this.#ended) {
      return;
    }
    const resolve = this.#waiting;
    if (resolve === undefined) {
      this.#queued.push(item);
      return;
    }
    this.#waiting = undefined;
    resolve({ done: false, value: item });
  }

  next(): Promise<IteratorResult<T>> {
    const [item, ...rest] = this.#queued;
    if (item !== undefined) {
      this.#queued = rest;
      return Promise.resolve({ done: false, value: item });
    }
    if (this.#ended) {
      return Promise.resolve({ done: true, value: undefined });
    }
    return new Promise((resolve) => {
      this.#waiting = resolve;
    });
  }

  /** The reader stopped, with `break` or `return`. */
  return(): Promise<IteratorResult<T>> {
    this.#ended = true;
    this.#queued = [];
    this.#waiting?.({ done: true, value: undefined });
    this.#waiting = undefined;
    this.#onLeave(this);
    return Promise.resolve({ done: true, value: undefined });
  }

  [Symbol.asyncIterator](): AsyncIterableIterator<T> {
    return this;
  }
}

/** Hands each change to every reader that is listening. Nothing is kept for readers that come later. */
export class ChangeFeed<T> {
  readonly #readers = new Set<Reader<T>>();

  /** A new reader; it ends when the reader stops. */
  listen(): AsyncIterableIterator<T> {
    const reader = new Reader<T>((left) => this.#readers.delete(left));
    this.#readers.add(reader);
    return reader;
  }

  /** Tells every reader about `item`. */
  push(item: T): void {
    for (const reader of this.#readers) {
      reader.push(item);
    }
  }
}
