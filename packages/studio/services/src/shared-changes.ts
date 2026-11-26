import type { MessagingId } from "@halonicjs/ports";

/** One reader of a {@link SharedChanges}, with its own queue, so a slow reader misses nothing. */
class SharedReader implements AsyncIterableIterator<MessagingId> {
  readonly #onLeave: (reader: SharedReader) => void;
  #queued: MessagingId[] = [];
  #waiting:
    | { resolve: (result: IteratorResult<MessagingId>) => void; reject: (error: unknown) => void }
    | undefined;
  #ended: { error: unknown } | "done" | undefined;

  constructor(onLeave: (reader: SharedReader) => void) {
    this.#onLeave = onLeave;
  }

  push(id: MessagingId): void {
    const waiting = this.#waiting;
    this.#waiting = undefined;
    if (waiting === undefined) this.#queued.push(id);
    else waiting.resolve({ done: false, value: id });
  }

  /** The shared stream ended, with its error when it failed: this reader ends once its queue is read. */
  end(ending: { error: unknown } | "done"): void {
    this.#ended = ending;
    const waiting = this.#waiting;
    this.#waiting = undefined;
    if (waiting === undefined) return;
    if (ending === "done") waiting.resolve({ done: true, value: undefined });
    else waiting.reject(ending.error);
  }

  next(): Promise<IteratorResult<MessagingId>> {
    const id = this.#queued.shift();
    if (id !== undefined) return Promise.resolve({ done: false, value: id });
    const ended = this.#ended;
    if (ended === "done") return Promise.resolve({ done: true, value: undefined });
    if (ended !== undefined) return Promise.reject(ended.error);
    return new Promise((resolve, reject) => {
      this.#waiting = { resolve, reject };
    });
  }

  /** The reader stopped, with `break` or `return`. */
  return(): Promise<IteratorResult<MessagingId>> {
    this.end("done");
    this.#queued = [];
    this.#onLeave(this);
    return Promise.resolve({ done: true, value: undefined });
  }

  [Symbol.asyncIterator](): AsyncIterableIterator<MessagingId> {
    return this;
  }
}

/** One run of the inner stream and the readers it serves. */
interface Run {
  readers: Set<SharedReader>;
  iterator: AsyncIterator<MessagingId>;
}

/**
 * One `AgentMessaging.changes` stream shared by every reader in Studio (requirement
 * `services.shared-changes`): the Inbox, the Messenger, the overview and the notifications each
 * listen, but the host gets one long poll, not one each. The inner stream starts with the first
 * reader and is stopped when the last one leaves; when it fails, every reader gets its error, and
 * the next reader starts it again.
 *
 * @example
 * const shared = new SharedChanges(() => hostMessaging.changes());
 * for await (const source of shared.listen()) refresh(source);
 */
export class SharedChanges {
  readonly #open: () => AsyncIterable<MessagingId>;
  #run: Run | undefined;

  constructor(open: () => AsyncIterable<MessagingId>) {
    this.#open = open;
  }

  /** A new reader of the shared stream; it ends when the reader stops or the stream ends. */
  listen(): AsyncIterableIterator<MessagingId> {
    const run = this.#run ?? this.#start();
    const reader = new SharedReader((left) => this.#leave(run, left));
    run.readers.add(reader);
    return reader;
  }

  #start(): Run {
    const run: Run = { readers: new Set(), iterator: this.#open()[Symbol.asyncIterator]() };
    this.#run = run;
    void this.#pump(run);
    return run;
  }

  async #pump(run: Run): Promise<void> {
    let ending: { error: unknown } | "done" = "done";
    try {
      for (
        let next = await run.iterator.next();
        next.done !== true;
        next = await run.iterator.next()
      ) {
        for (const reader of run.readers) reader.push(next.value);
      }
    } catch (error) {
      ending = { error };
    }
    if (this.#run === run) this.#run = undefined;
    for (const reader of run.readers) reader.end(ending);
  }

  #leave(run: Run, reader: SharedReader): void {
    run.readers.delete(reader);
    if (run.readers.size > 0 || this.#run !== run) return;
    // The last reader left: a later one starts a new run, and this one stops at its next answer.
    this.#run = undefined;
    run.iterator.return?.().catch((error: unknown) => {
      console.error("Stopping the shared changes stream", error);
    });
  }
}
