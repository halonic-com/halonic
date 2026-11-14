import type { RunEvent } from "@halonicjs/events";
import type { RunEventListener, RunSubscription } from "@halonicjs/ports";
import type { RunObjectNamespace } from "./durable-scheduler.ts";
import type { RunObjectApi } from "./run-object-api.ts";

/** What {@link DurableRunEvents} needs. */
export interface DurableRunEventsOptions<Id> {
  /** The Durable Object namespace bound to `RunObject`. */
  namespace: RunObjectNamespace<Id>;
  /** Put before every run id to make the object's name; must match the one of `DurableRunStore`. */
  namePrefix?: string;
}

/** Splits a stream of bytes into its lines, and gives the last one even without a final newline. */
async function* readLines(reader: ReadableStreamDefaultReader<Uint8Array>): AsyncGenerator<string> {
  const decoder = new TextDecoder();
  let pending = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    pending += decoder.decode(value, { stream: true });
    const lines = pending.split("\n");
    pending = lines.pop() ?? "";
    yield* lines.filter((line) => line !== "");
  }
  pending += decoder.decode();
  if (pending !== "") yield pending;
}

/**
 * The `subscribe` of the `RunExecutor` port over the run objects: it follows a run's log live
 * through the object's `watch` stream. The object sends the events after `afterSeq` and then each
 * new one, in order and without a gap, and closes the stream after the run's ending event, so
 * this class only reads lines, parses them and tells the listener.
 *
 * Like `DurableRunStore` it holds no stub: every subscription gets a fresh one.
 */
export class DurableRunEvents<Id = unknown> {
  readonly #namespace: RunObjectNamespace<Id>;
  readonly #namePrefix: string;

  constructor(options: DurableRunEventsOptions<Id>) {
    this.#namespace = options.namespace;
    this.#namePrefix = options.namePrefix ?? "";
  }

  /**
   * Starts following the run. The listener is never called before this returns, and never after
   * the returned subscription is closed.
   */
  subscribe(runId: string, afterSeq: number, listener: RunEventListener): RunSubscription {
    const subscription = new Subscription(listener);
    // `follow` reports every failure to the listener; a listener that throws must not escape.
    subscription.follow(() => this.#object(runId).watch(afterSeq)).catch(() => {});
    return subscription;
  }

  #object(runId: string): RunObjectApi {
    return this.#namespace.get(this.#namespace.idFromName(`${this.#namePrefix}${runId}`));
  }
}

/** One open subscription: reads its stream and passes what it reads to the listener. */
class Subscription implements RunSubscription {
  readonly #listener: RunEventListener;
  #closed = false;
  #reader: ReadableStreamDefaultReader<Uint8Array> | undefined;

  constructor(listener: RunEventListener) {
    this.#listener = listener;
  }

  async follow(open: () => Promise<ReadableStream<Uint8Array>>): Promise<void> {
    try {
      const stream = await open();
      if (this.#closed) {
        await stream.cancel();
        return;
      }
      this.#reader = stream.getReader();
      for await (const line of readLines(this.#reader)) {
        if (this.#closed) return;
        this.#listener.onEvent(JSON.parse(line) as RunEvent);
      }
      this.#finish();
    } catch (error) {
      this.#release(error);
      this.#finish(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /** Cancelling the reader ends a read that is waiting, and frees the watcher in the run object. */
  close(): void {
    this.#closed = true;
    this.#release();
  }

  /** Frees the watcher; every way out that is not the stream's own end must come through here. */
  #release(reason?: unknown): void {
    void this.#reader?.cancel(reason).catch(() => {});
  }

  /** Tells the listener the stream is over, unless the caller closed the subscription first. */
  #finish(error?: Error): void {
    if (this.#closed) return;
    this.#closed = true;
    this.#listener.onClose(error);
  }
}
