/**
 * The messages for one waiting request, in arrival order. The transport's
 * reader puts them in; the request reads them out as they come. It ends
 * after the answer, or fails when the session ends first.
 */
export class MessageQueue {
  readonly #messages: unknown[] = [];
  #finished = false;
  #failure: Error | undefined;
  #wake: (() => void) | undefined;

  /** Adds a message the request reads next. */
  push(message: unknown): void {
    this.#messages.push(message);
    this.#notify();
  }

  /** Adds the answer: the last message the request reads. */
  finish(answer: unknown): void {
    this.push(answer);
    this.#finished = true;
  }

  /** Ends the queue with an error, after the messages already in it. */
  fail(error: Error): void {
    this.#failure ??= error;
    this.#notify();
  }

  /** Reads the messages until the answer. */
  async *read(): AsyncGenerator<unknown> {
    for (;;) {
      const message = this.#messages.shift();
      if (message !== undefined) {
        yield message;
        if (this.#finished && this.#messages.length === 0) return;
        continue;
      }
      if (this.#failure !== undefined) throw this.#failure;
      await new Promise<void>((resolve) => {
        this.#wake = resolve;
      });
    }
  }

  #notify(): void {
    const wake = this.#wake;
    this.#wake = undefined;
    wake?.();
  }
}
