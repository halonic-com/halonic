import type { MessagingId } from "@halonicjs/ports";

/** The sources that changed after a reader's last look, and where its next look starts. */
export interface ChangesSince {
  /** What the reader passes as `after` next time. */
  next: number;
  sources: MessagingId[];
}

/**
 * Which source changed last when, for Studio, which asks the host over a
 * request rather than holding a stream open. Each change gets the next
 * number; a reader asks for the sources that changed after the number it
 * last got. Only each source's last change is kept, so it stays as small as
 * the list of sources.
 */
export class ChangeLog {
  #count = 0;
  readonly #lastChange = new Map<MessagingId, number>();
  #following: AsyncIterator<MessagingId> | undefined;

  /** Records that `source` changed. */
  note(source: MessagingId): void {
    this.#count += 1;
    this.#lastChange.set(source, this.#count);
  }

  /**
   * The sources that changed after `after`. A number the log never gave
   * (Studio kept it from a host that has since restarted) counts from the
   * start, so the reader reads every source again rather than missing one.
   */
  since(after: number): ChangesSince {
    const from = after > this.#count ? 0 : after;
    const sources = [...this.#lastChange].filter(([, at]) => at > from).map(([source]) => source);
    return { next: this.#count, sources };
  }

  /** Records every change `stream` names, instead of the stream it followed before. */
  follow(stream: AsyncIterable<MessagingId>, failed: (error: unknown) => void): void {
    this.stop(failed);
    const iterator = stream[Symbol.asyncIterator]();
    this.#following = iterator;
    this.#record(iterator).catch(failed);
  }

  /** Stops following the stream. */
  stop(failed: (error: unknown) => void): void {
    const following = this.#following;
    this.#following = undefined;
    following?.return?.()?.catch(failed);
  }

  async #record(iterator: AsyncIterator<MessagingId>): Promise<void> {
    while (this.#following === iterator) {
      const next = await iterator.next();
      if (next.done === true) return;
      this.note(next.value);
    }
  }
}
