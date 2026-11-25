import type { MessagingId } from "@halonicjs/ports";

/** The sources that changed after a reader's last look, and where its next look starts. */
export interface ChangesSince {
  /** What the reader passes as `after` next time. */
  next: number;
  sources: MessagingId[];
}

/**
 * How long a reader that asks to wait is held before it gets an empty answer.
 * Below the shell's 120 s limit on a JSON route, so a quiet host never looks
 * like a hung one.
 */
export const changesWaitMs = 25_000;

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
  /** The readers waiting for a change, each answered by calling it. */
  readonly #waiting = new Set<() => void>();

  /** Records that `source` changed, and answers every reader waiting for a change. */
  note(source: MessagingId): void {
    this.#count += 1;
    this.#lastChange.set(source, this.#count);
    for (const answer of [...this.#waiting]) answer();
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

  /**
   * The sources that changed after `after`, as soon as there are any: at once
   * when some already did, otherwise on the next change, or with none after
   * `timeoutMs` or when `signal` aborts (the reader went away). Each reader
   * waits on its own, so one that waits never holds back another's answer.
   */
  waitSince(after: number, timeoutMs: number, signal?: AbortSignal): Promise<ChangesSince> {
    const now = this.since(after);
    if (now.sources.length > 0 || signal?.aborted === true) return Promise.resolve(now);
    return new Promise((resolve) => {
      const answer = () => {
        clearTimeout(timer);
        signal?.removeEventListener("abort", answer);
        this.#waiting.delete(answer);
        resolve(this.since(after));
      };
      const timer = setTimeout(answer, timeoutMs);
      signal?.addEventListener("abort", answer, { once: true });
      this.#waiting.add(answer);
    });
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

  /** Stops following the stream and answers every waiting reader, when the host stops. */
  close(failed: (error: unknown) => void): void {
    this.stop(failed);
    for (const answer of [...this.#waiting]) answer();
  }

  async #record(iterator: AsyncIterator<MessagingId>): Promise<void> {
    while (this.#following === iterator) {
      const next = await iterator.next();
      if (next.done === true) return;
      this.note(next.value);
    }
  }
}
