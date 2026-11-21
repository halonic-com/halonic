/**
 * One reader's stream with its own queue, so a slow reader never loses an
 * item and a fast writer never waits. The writer calls `push` and `end`; the
 * reader iterates it with `for await`. A reader that leaves early, with
 * `break` or `return`, empties the queue and calls `onLeave`, so the writer
 * can stop pushing to it.
 *
 * @example
 * const readers = new Set<AsyncFeed<string>>();
 * const feed = new AsyncFeed<string>((left) => readers.delete(left));
 * readers.add(feed);
 * feed.push("ready");
 * for await (const state of feed) show(state);
 */
export class AsyncFeed<Item> implements AsyncIterableIterator<Item> {
  readonly #onLeave: (feed: AsyncFeed<Item>) => void;
  #queued: Item[] = [];
  #waiting: ((result: IteratorResult<Item>) => void) | undefined;
  #ended = false;

  /** @param onLeave - called once when the reader leaves early */
  constructor(onLeave: (feed: AsyncFeed<Item>) => void = () => {}) {
    this.#onLeave = onLeave;
  }

  /** Queues an item for the reader; does nothing once the feed has ended. */
  push(item: Item): void {
    if (this.#ended) return;
    const waiting = this.#waiting;
    if (waiting === undefined) {
      this.#queued.push(item);
      return;
    }
    this.#waiting = undefined;
    waiting({ done: false, value: item });
  }

  /** Ends the stream after the items already queued. */
  end(): void {
    this.#ended = true;
    const waiting = this.#waiting;
    if (waiting === undefined) return;
    this.#waiting = undefined;
    waiting({ done: true, value: undefined });
  }

  next(): Promise<IteratorResult<Item>> {
    if (this.#queued.length > 0) {
      return Promise.resolve({ done: false, value: this.#queued.shift() as Item });
    }
    if (this.#ended) return Promise.resolve({ done: true, value: undefined });
    return new Promise((resolve) => {
      this.#waiting = resolve;
    });
  }

  /** The reader left early: the queue is dropped and `onLeave` is told, once. */
  return(): Promise<IteratorResult<Item>> {
    const left = !this.#ended;
    this.#ended = true;
    this.#queued = [];
    this.#waiting?.({ done: true, value: undefined });
    this.#waiting = undefined;
    if (left) this.#onLeave(this);
    return Promise.resolve({ done: true, value: undefined });
  }

  [Symbol.asyncIterator](): AsyncIterableIterator<Item> {
    return this;
  }
}
