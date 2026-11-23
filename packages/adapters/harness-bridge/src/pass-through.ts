import type { HttpClient } from "@halonicjs/ports";
import { KindedError } from "@halonicjs/std";
import type { BridgeRequestContext } from "./route.ts";

/**
 * The `fetch` the bridge calls providers and tools with: an `HttpClient`'s,
 * so the app decides which hosts it may reach and how (the address check,
 * a proxy). The bridge never reaches for Node's own `fetch`. Tests give a fake.
 */
export type Fetch = HttpClient["fetch"];

/** How long the bridge waits for a provider (failure-path rule 1: every wait ends). */
export interface UpstreamLimits {
  /** How long the provider may take to start its reply, in milliseconds. */
  responseTimeoutMs: number;
  /**
   * How long a reply that has started may go without sending anything, in
   * milliseconds. The program gets the same time to take what was already
   * sent once it stops reading.
   */
  idleTimeoutMs: number;
}

/** One request the bridge sends on to a provider's fixed host. */
export interface UpstreamRequest {
  /** The provider's name as people know it, for error messages. */
  provider: string;
  url: URL;
  headers: Record<string, string>;
  body: Uint8Array;
  /** Which of the provider's reply headers go back to the program. */
  replyHeader(name: string): boolean;
  /** Sees the reply as it goes back, such as to read what the call used. */
  watch?: ReplyWatcher;
}

/** Sees a provider's reply as the bridge copies it back to the program. */
export interface ReplyWatcher {
  /** The reply has started, with the provider's status and headers. */
  started(status: number, headers: Headers): void;
  /** The next piece of the body, as the provider sent it. */
  received(chunk: Uint8Array): void;
}

/** What {@link passThrough} calls out with, and how long it waits. */
export interface UpstreamCaller {
  fetch: Fetch;
  limits: UpstreamLimits;
}

/**
 * The request headers named in `names`, as the program sent them. Every
 * other header stays behind, the program's own key and the run token among
 * them.
 */
export function pickHeaders(headers: Headers, names: readonly string[]): Record<string, string> {
  const picked: Record<string, string> = {};
  for (const name of names) {
    const value = headers.get(name);
    if (value !== null) picked[name] = value;
  }
  return picked;
}

/** A provider's reply on its way back to the program. */
export interface PassedReply {
  /** The reply the route answers with; its body streams the provider's as it arrives. */
  response: Response;
  /**
   * Settles once the body has ended, whether it was read to the end, failed
   * or was given up by the program. It never rejects: the bridge reports a
   * body that fails.
   */
  ended: Promise<void>;
}

/**
 * Sends a request on to the provider and hands its reply back for the
 * program: the status, the allowed headers and the body byte for byte, as
 * it arrives, so a stream of server-sent events stays a stream. The
 * provider's own error replies go back unchanged.
 *
 * The call to the provider stops when the program goes away, the bridge
 * closes, the provider is silent for longer than the limits allow, or the
 * program stops reading for as long as the idle limit. Each wait has its own
 * reason, so a program that stops reading isn't taken for a silent provider.
 * Once the reply has started, the body fails with that reason.
 *
 * @throws KindedError `unavailable` when the provider can't be reached or doesn't start its reply in time
 */
export async function passThrough(
  context: BridgeRequestContext,
  upstream: UpstreamRequest,
  caller: UpstreamCaller,
): Promise<PassedReply> {
  const { limits } = caller;
  const deadline = new Deadline();
  const signal = AbortSignal.any([context.signal, deadline.signal]);
  let reply: Response;
  try {
    deadline.start(limits.responseTimeoutMs, didNotAnswer(upstream, limits));
    reply = await callProvider(upstream, caller.fetch, signal);
  } catch (error) {
    deadline.clear();
    throw deadline.signal.aborted ? deadline.signal.reason : error;
  }
  upstream.watch?.started(reply.status, reply.headers);
  const headers = replyHeaders(reply.headers, upstream.replyHeader);
  if (reply.body === null) {
    deadline.clear();
    return {
      response: new Response(null, { status: reply.status, headers }),
      ended: Promise.resolve(),
    };
  }
  const body = new CopiedBody(reply.body, upstream, limits, deadline, signal);
  return {
    response: new Response(body.stream, { status: reply.status, headers }),
    ended: body.ended,
  };
}

/**
 * The provider's body as the program reads it. It reads the provider only
 * when the program asks for more, so a program that stops reading holds the
 * provider back instead of filling memory, and runs out of the idle limit.
 */
class CopiedBody {
  readonly stream: ReadableStream<Uint8Array>;
  readonly ended: Promise<void>;
  #end: () => void = () => {};
  #finished = false;

  constructor(
    source: ReadableStream<Uint8Array>,
    upstream: UpstreamRequest,
    limits: UpstreamLimits,
    deadline: Deadline,
    signal: AbortSignal,
  ) {
    this.ended = new Promise((resolve) => {
      this.#end = resolve;
    });
    const reader = source.getReader();
    const finish = () => {
      this.#finished = true;
      deadline.clear();
      signal.removeEventListener("abort", onAbort);
      this.#end();
    };
    let controller: ReadableStreamDefaultController<Uint8Array> | undefined;
    // A wait that runs out, or the bridge closing, while the program isn't reading.
    const onAbort = () => {
      if (this.#finished) return;
      controller?.error(signal.reason);
      finish();
    };
    signal.addEventListener("abort", onAbort, { once: true });
    this.stream = new ReadableStream<Uint8Array>(
      {
        start: (started) => {
          controller = started;
          deadline.start(limits.idleTimeoutMs, stoppedReading(limits));
        },
        pull: async (pulled) => {
          deadline.start(limits.idleTimeoutMs, wentSilent(upstream, limits));
          try {
            const { done, value } = await reader.read();
            if (this.#finished) return;
            if (done) {
              pulled.close();
              finish();
              return;
            }
            upstream.watch?.received(value);
            pulled.enqueue(value);
            deadline.start(limits.idleTimeoutMs, stoppedReading(limits));
          } catch (error) {
            if (this.#finished) return;
            pulled.error(deadline.signal.aborted ? deadline.signal.reason : error);
            finish();
          }
        },
        cancel: async (reason) => {
          finish();
          await reader.cancel(reason);
        },
      },
      // Read the provider only for a read the program has asked for.
      { highWaterMark: 0 },
    );
  }
}

/**
 * The time limit of the wait in progress. It stops the call with that wait's
 * reason when the time is up.
 */
class Deadline {
  readonly #passed = new AbortController();
  #timer: ReturnType<typeof setTimeout> | undefined;

  /** Aborted, with the reason of the wait whose time ran out. */
  get signal(): AbortSignal {
    return this.#passed.signal;
  }

  /** Ends the previous wait's limit and gives the next wait `ms` milliseconds. */
  start(ms: number, reason: KindedError): void {
    this.clear();
    this.#timer = setTimeout(() => this.#passed.abort(reason), ms);
  }

  clear(): void {
    clearTimeout(this.#timer);
  }
}

function didNotAnswer(upstream: UpstreamRequest, limits: UpstreamLimits): KindedError {
  const seconds = limits.responseTimeoutMs / 1000;
  return new KindedError(
    "unavailable",
    `${upstream.provider} didn't answer within ${seconds} seconds.`,
  );
}

function wentSilent(upstream: UpstreamRequest, limits: UpstreamLimits): KindedError {
  const seconds = limits.idleTimeoutMs / 1000;
  return new KindedError(
    "unavailable",
    `${upstream.provider} sent nothing for ${seconds} seconds.`,
  );
}

function stoppedReading(limits: UpstreamLimits): KindedError {
  const seconds = limits.idleTimeoutMs / 1000;
  return new KindedError(
    "unavailable",
    `The program read nothing of the reply for ${seconds} seconds.`,
  );
}

/** Calls the provider and waits for its reply to start. */
async function callProvider(
  upstream: UpstreamRequest,
  fetch: Fetch,
  signal: AbortSignal,
): Promise<Response> {
  try {
    return await fetch(upstream.url.href, {
      method: "POST",
      headers: upstream.headers,
      body: upstream.body,
      // A redirect would carry the key to another address.
      redirect: "error",
      signal,
    });
  } catch (cause) {
    if (signal.aborted) throw cause;
    throw new KindedError("unavailable", `Halonic couldn't reach ${upstream.provider}.`, {
      cause,
    });
  }
}

/** The provider's reply headers the program gets. */
function replyHeaders(
  headers: Headers,
  allowed: (name: string) => boolean,
): Record<string, string> {
  const picked: Record<string, string> = {};
  for (const [name, value] of headers) {
    if (allowed(name)) picked[name] = value;
  }
  return picked;
}
