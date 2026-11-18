/** A stream with its own queue, so a slow reader never loses an item. Used by the fakes. */
export class Feed<T> implements AsyncIterableIterator<T> {
  private queued: T[] = [];
  private waiting: ((result: IteratorResult<T>) => void) | undefined;
  private ended = false;

  private readonly onLeave: (feed: Feed<T>) => void;

  constructor(onLeave: (feed: Feed<T>) => void) {
    this.onLeave = onLeave;
  }

  push(item: T): void {
    if (this.ended) return;
    if (this.waiting === undefined) {
      this.queued.push(item);
      return;
    }
    const resolve = this.waiting;
    this.waiting = undefined;
    resolve({ done: false, value: item });
  }

  /** Ends the stream after the items already queued. */
  end(): void {
    this.ended = true;
    if (this.waiting === undefined) return;
    const resolve = this.waiting;
    this.waiting = undefined;
    resolve({ done: true, value: undefined });
  }

  next(): Promise<IteratorResult<T>> {
    const [item, ...rest] = this.queued;
    if (item !== undefined) {
      this.queued = rest;
      return Promise.resolve({ done: false, value: item });
    }
    if (this.ended) return Promise.resolve({ done: true, value: undefined });
    return new Promise((resolve) => {
      this.waiting = resolve;
    });
  }

  /** The reader left early, with `break` or `return`. */
  return(): Promise<IteratorResult<T>> {
    this.ended = true;
    this.queued = [];
    this.onLeave(this);
    return Promise.resolve({ done: true, value: undefined });
  }

  [Symbol.asyncIterator](): AsyncIterableIterator<T> {
    return this;
  }
}
