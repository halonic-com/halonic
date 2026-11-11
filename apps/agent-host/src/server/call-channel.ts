import type { NdjsonStream } from "./ndjson-stream.ts";

/** What the host asks Studio, as one line of the stream. */
export interface ChannelCallLine {
  type: "call";
  /** Unique on this channel; Studio names it in its answer. */
  call: string;
  method: string;
  params: unknown;
}

/** Tells Studio the host no longer waits for a call, because its signal aborted. */
export interface ChannelCancelLine {
  type: "cancel";
  call: string;
}

/** Studio's answer to one call: its result, or why it couldn't give one. */
export type ChannelAnswer = { result: unknown } | { error: string };

/** A call Studio answered with an error, or that the channel closed under. */
export class StudioCallError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StudioCallError";
  }
}

interface PendingCall {
  method: string;
  resolve(result: unknown): void;
  reject(error: unknown): void;
}

/**
 * Calls from the host to Studio over loopback. Studio can reach the host but
 * the host can't reach Studio, so each call goes out as a line on a streamed
 * answer Studio keeps open, and comes back as a request Studio sends with its
 * answer ({@link CallChannel.answer}). A service the host serves for Studio,
 * such as the bridge's recorder, is then a few plain async functions over
 * {@link CallChannel.call}.
 */
export class CallChannel {
  private readonly stream: NdjsonStream;
  private readonly pending = new Map<string, PendingCall>();
  private nextCall = 1;
  private closed = false;

  constructor(stream: NdjsonStream) {
    this.stream = stream;
  }

  /**
   * Asks Studio and waits for its answer.
   *
   * @throws {StudioCallError} when Studio answers with an error, or the channel closes first
   * @throws the signal's reason when it aborts first; Studio is told to stop
   */
  call(method: string, params: unknown, options: { signal?: AbortSignal } = {}): Promise<unknown> {
    const { signal } = options;
    if (this.closed) return Promise.reject(closedError(method));
    if (signal?.aborted) return Promise.reject(signal.reason);
    const call = String(this.nextCall++);
    return new Promise((resolve, reject) => {
      const onAbort = (): void => {
        this.pending.delete(call);
        const line: ChannelCancelLine = { type: "cancel", call };
        this.stream.send(line);
        reject(signal?.reason);
      };
      const settle = (): void => signal?.removeEventListener("abort", onAbort);
      this.pending.set(call, {
        method,
        resolve: (result) => {
          settle();
          resolve(result);
        },
        reject: (error) => {
          settle();
          reject(error);
        },
      });
      signal?.addEventListener("abort", onAbort, { once: true });
      const line: ChannelCallLine = { type: "call", call, method, params };
      this.stream.send(line);
    });
  }

  /**
   * Settles the call with this id with Studio's answer.
   *
   * @returns false when no call with this id is waiting: never made, answered already, or cancelled
   */
  answer(call: string, answer: ChannelAnswer): boolean {
    const pending = this.pending.get(call);
    if (pending === undefined) return false;
    this.pending.delete(call);
    if ("error" in answer) {
      pending.reject(
        new StudioCallError(`Studio couldn't answer ${pending.method}: ${answer.error}`),
      );
    } else {
      pending.resolve(answer.result);
    }
    return true;
  }

  /** Fails every waiting call and every later one. Safe to call twice. */
  close(): void {
    this.closed = true;
    for (const [call, pending] of this.pending) {
      this.pending.delete(call);
      pending.reject(closedError(pending.method));
    }
  }
}

function closedError(method: string): StudioCallError {
  return new StudioCallError(`The channel to Studio closed before it answered ${method}.`);
}
