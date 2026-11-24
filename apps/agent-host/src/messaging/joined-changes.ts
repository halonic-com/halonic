import type { MessagingId } from "@halonicjs/ports";

/** What a reader of {@link joinChanges} hears about a provider whose changes stopped with an error. */
export type ChangesFailed = (index: number, error: unknown) => void;

/**
 * One stream of the source IDs every provider's `changes` gives, in the order
 * they come. A provider whose stream fails is reported and the others go on.
 * When the reader stops (`break` or `return`), every provider's stream is
 * stopped too, so nothing keeps reading for a reader that left.
 */
export function joinChanges(
  streams: readonly AsyncIterable<MessagingId>[],
  failed: ChangesFailed,
): AsyncIterableIterator<MessagingId> {
  const queue = new ChangeQueue();
  const iterators = streams.map((stream) => stream[Symbol.asyncIterator]());
  const stopAll = () => {
    iterators.forEach((iterator, index) => {
      iterator.return?.()?.catch((error: unknown) => failed(index, error));
    });
  };
  iterators.forEach((iterator, index) => {
    pump(iterator, queue).catch((error: unknown) => failed(index, error));
  });
  return queue.reader(stopAll);
}

/** Copies one provider's stream into the queue until it ends or the reader leaves. */
async function pump(iterator: AsyncIterator<MessagingId>, queue: ChangeQueue): Promise<void> {
  while (!queue.left) {
    const next = await iterator.next();
    if (next.done === true) return;
    queue.push(next.value);
  }
}

/** A queue with one reader, so a slow reader never loses a change. */
class ChangeQueue {
  left = false;
  #queued: MessagingId[] = [];
  #waiting: ((result: IteratorResult<MessagingId>) => void) | undefined;

  push(id: MessagingId): void {
    if (this.left) return;
    const waiting = this.#waiting;
    if (waiting === undefined) {
      this.#queued.push(id);
      return;
    }
    this.#waiting = undefined;
    waiting({ done: false, value: id });
  }

  reader(onLeave: () => void): AsyncIterableIterator<MessagingId> {
    const reader: AsyncIterableIterator<MessagingId> = {
      next: () => this.#next(),
      return: () => {
        this.#leave();
        onLeave();
        return Promise.resolve({ done: true, value: undefined });
      },
      [Symbol.asyncIterator]: () => reader,
    };
    return reader;
  }

  #next(): Promise<IteratorResult<MessagingId>> {
    const first = this.#queued.shift();
    if (first !== undefined) return Promise.resolve({ done: false, value: first });
    if (this.left) return Promise.resolve({ done: true, value: undefined });
    return new Promise((resolve) => {
      this.#waiting = resolve;
    });
  }

  #leave(): void {
    this.left = true;
    this.#queued = [];
    const waiting = this.#waiting;
    this.#waiting = undefined;
    waiting?.({ done: true, value: undefined });
  }
}
