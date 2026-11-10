import type { HarnessEvent } from "@halonicjs/ports";

/** How the stream ended: by itself, or with an error. */
type Ending = { kind: "done" } | { kind: "failed"; error: Error };

/**
 * The events of one run, between the client, which hears Codex's messages
 * as they come, and the reader of the run's stream, which asks for them
 * one at a time (requirement `harness-codex.run-events`). Events wait here
 * until they are read. The first ending
 * wins: an error after the stream is done, or a second error, is dropped.
 */
export class RunEvents {
  readonly #waiting: HarnessEvent[] = [];
  #ending: Ending | undefined;
  /** Wakes the reader that waits for the next event. */
  #wake: (() => void) | undefined;

  /** Adds events for the reader, in order. Events after the ending are dropped. */
  push(events: readonly HarnessEvent[]): void {
    if (this.#ending !== undefined) return;
    this.#waiting.push(...events);
    this.#wakeReader();
  }

  /** Ends the stream once the waiting events are read. */
  end(): void {
    this.#settle({ kind: "done" });
  }

  /** Ends the stream with `error` once the waiting events are read. */
  fail(error: Error): void {
    this.#settle({ kind: "failed", error });
  }

  /** Whether the stream has an ending, so no more events can come. */
  get ended(): boolean {
    return this.#ending !== undefined;
  }

  async *[Symbol.asyncIterator](): AsyncGenerator<HarnessEvent> {
    for (;;) {
      const next = this.#waiting.shift();
      if (next !== undefined) {
        yield next;
        continue;
      }
      if (this.#ending?.kind === "failed") throw this.#ending.error;
      if (this.#ending?.kind === "done") return;
      await new Promise<void>((resolve) => {
        this.#wake = resolve;
      });
    }
  }

  #settle(ending: Ending): void {
    if (this.#ending !== undefined) return;
    this.#ending = ending;
    this.#wakeReader();
  }

  #wakeReader(): void {
    const wake = this.#wake;
    this.#wake = undefined;
    wake?.();
  }
}
