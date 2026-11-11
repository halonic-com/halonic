// The same file is in model-anthropic. Like read-body.ts, it is a candidate for
// the shared http-kit in the plan's adapters table.

/** How long one call to the API may wait (failure-path rule 1: every wait ends). */
export interface CallLimits {
  /** How long the API may take to start its reply, in milliseconds. */
  readonly responseTimeoutMs: number;
  /** How long a reply that has started may go without sending anything, in milliseconds. */
  readonly idleTimeoutMs: number;
}

/**
 * The limits a provider uses when it is given none, the same as the harness
 * bridge's. An answer that isn't streamed starts its reply only once it is
 * complete, so the first limit is long.
 */
export const defaultCallLimits: CallLimits = {
  responseTimeoutMs: 10 * 60_000,
  idleTimeoutMs: 2 * 60_000,
};

/** Which limit of a call passed. */
export class CallTimeoutError extends Error {
  override readonly name = "CallTimeoutError";
  /** `response`: the reply didn't start in time. `idle`: a started reply went silent. */
  readonly limit: "response" | "idle";
  readonly ms: number;

  constructor(limit: "response" | "idle", ms: number) {
    super(limit === "response" ? `no reply within ${ms} ms` : `nothing sent for ${ms} ms`);
    this.limit = limit;
    this.ms = ms;
  }
}

/**
 * The time limits of one call. Its {@link CallTimer.signal} goes to `fetch`:
 * it aborts with the caller's reason when the caller's signal aborts, and
 * with a {@link CallTimeoutError} when a limit passes. The response limit
 * runs from the start; {@link CallTimer.watch} switches to the idle limit
 * once the reply has started.
 */
export class CallTimer {
  readonly signal: AbortSignal;
  readonly #own = new AbortController();
  readonly #limits: CallLimits;
  #timer: ReturnType<typeof setTimeout> | undefined;
  #timedOut: CallTimeoutError | undefined;

  constructor(limits: CallLimits, caller: AbortSignal | undefined) {
    this.#limits = limits;
    this.signal =
      caller === undefined ? this.#own.signal : AbortSignal.any([caller, this.#own.signal]);
    this.#arm("response", limits.responseTimeoutMs);
  }

  /** The limit that passed, or `undefined` while none has. */
  get timedOut(): CallTimeoutError | undefined {
    return this.#timedOut;
  }

  /**
   * The reply, with a body that restarts the idle limit with each piece it
   * passes on. Read the reply only through what this gives back.
   */
  watch(reply: Response): Response {
    const idleMs = this.#limits.idleTimeoutMs;
    this.#arm("idle", idleMs);
    if (reply.body === null) return reply;
    const source = reply.body.getReader();
    // Read on demand, not piped, so cancelling the watched body cancels the
    // reply's own body straight away and the connection closes.
    const watched = new ReadableStream<Uint8Array>({
      pull: async (controller) => {
        const { done, value } = await source.read();
        if (done) {
          controller.close();
          return;
        }
        this.#arm("idle", idleMs);
        controller.enqueue(value);
      },
      cancel: (reason) => source.cancel(reason),
    });
    const { status, statusText, headers } = reply;
    return new Response(watched, { status, statusText, headers });
  }

  /** Stops the timer. Call it once the call is over, however it ended. */
  end(): void {
    clearTimeout(this.#timer);
  }

  #arm(limit: "response" | "idle", ms: number): void {
    clearTimeout(this.#timer);
    this.#timer = setTimeout(() => {
      this.#timedOut = new CallTimeoutError(limit, ms);
      this.#own.abort(this.#timedOut);
    }, ms);
  }
}
