// Requests Halonic closed because their tool call ended. The runner may have
// sent a `pull` or `cancel-body` for one before it read the close, so such a
// frame is ignored, not a violation (HAL-4353). A number is kept only until
// the runner shows it has read past the close: then no such frame can still
// be on its way, and the number is forgotten, so the list stays small for as
// long as the runner lives.
//
// The runner reads its stdin in order and Halonic reads its stdout in order.
// So when the runner answers a frame Halonic sent after the close (a `pong`
// for a later ping, or a `fetch` or `result` in a later call), every frame it
// sent before reading the close has already arrived.

/** How far Halonic had sent when it closed a request: the numbers its next call and next ping get. */
export interface SentMark {
  readonly nextCall: number;
  readonly nextPing: number;
}

interface ClosedRequest {
  readonly id: number;
  readonly mark: SentMark;
}

/** The requests closed with their call, until the runner has read past each close. */
export class ClosedRequests {
  /** In the order they were closed, so their marks only go up. */
  #closed: ClosedRequest[] = [];

  /** Notes a request closed when its call ended. `mark` is how far Halonic had sent at that moment. */
  add(id: number, mark: SentMark): void {
    this.#closed.push({ id, mark });
  }

  /** Whether a late frame for this request is still to be ignored. */
  has(id: number): boolean {
    return this.#closed.some((closed) => closed.id === id);
  }

  /** The runner sent a frame in call `call`, so it has read every frame sent before that call. */
  runnerReadCall(call: number): void {
    this.#forgetWhile((mark) => call >= mark.nextCall);
  }

  /** The runner answered ping `n`, so it has read every frame sent before that ping. */
  runnerReadPing(n: number): void {
    this.#forgetWhile((mark) => n >= mark.nextPing);
  }

  /** How many numbers are kept, for tests. */
  get size(): number {
    return this.#closed.length;
  }

  #forgetWhile(readPast: (mark: SentMark) => boolean): void {
    const firstKept = this.#closed.findIndex((closed) => !readPast(closed.mark));
    this.#closed = firstKept === -1 ? [] : this.#closed.slice(firstKept);
  }
}
