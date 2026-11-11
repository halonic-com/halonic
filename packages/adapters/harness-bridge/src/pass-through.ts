import { once } from "node:events";
import type { IncomingHttpHeaders } from "node:http";
import { KindedError } from "@halonicjs/std";
import type { BridgeRequestContext } from "./route.ts";

/** The `fetch` the bridge calls providers with; tests give a fake one. */
export type Fetch = typeof globalThis.fetch;

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
export function pickHeaders(
  headers: IncomingHttpHeaders,
  names: readonly string[],
): Record<string, string> {
  const picked: Record<string, string> = {};
  for (const name of names) {
    const value = headers[name];
    if (value !== undefined) picked[name] = Array.isArray(value) ? value.join(", ") : value;
  }
  return picked;
}

/**
 * Sends a request on to the provider and copies its reply back to the
 * program: the status, the allowed headers and the body byte for byte, as
 * it arrives, so a stream of server-sent events stays a stream. The
 * provider's own error replies go back unchanged.
 *
 * The call to the provider stops when the program goes away, the bridge
 * closes, the provider is silent for longer than the limits allow, or the
 * program stops reading for as long as the idle limit. Each wait has its own
 * reason, so a program that stops reading isn't taken for a silent provider.
 *
 * @throws KindedError `unavailable` when the provider can't be reached or doesn't start its reply in time, goes silent, or the program stops reading
 */
export async function passThrough(
  context: BridgeRequestContext,
  upstream: UpstreamRequest,
  caller: UpstreamCaller,
): Promise<void> {
  const { limits } = caller;
  const deadline = new Deadline();
  const signal = AbortSignal.any([context.signal, deadline.signal]);

  try {
    deadline.start(limits.responseTimeoutMs, didNotAnswer(upstream, limits));
    const reply = await callProvider(upstream, caller.fetch, signal);
    context.response.writeHead(reply.status, replyHeaders(reply.headers, upstream.replyHeader));
    upstream.watch?.started(reply.status, reply.headers);
    // Send the status now: a program waiting on a stream shouldn't wait for its first event too.
    context.response.flushHeaders();
    if (reply.body !== null) {
      const reader = reply.body.getReader();
      for (;;) {
        deadline.start(limits.idleTimeoutMs, wentSilent(upstream, limits));
        const { done, value } = await reader.read();
        if (done) break;
        upstream.watch?.received(value);
        if (!context.response.write(value)) {
          deadline.start(limits.idleTimeoutMs, stoppedReading(limits));
          await once(context.response, "drain", { signal });
        }
      }
    }
    context.response.end();
  } catch (error) {
    throw deadline.signal.aborted ? deadline.signal.reason : error;
  } finally {
    deadline.clear();
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
    return await fetch(upstream.url, {
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
