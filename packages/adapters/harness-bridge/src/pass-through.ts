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
  /** How long a reply that has started may go without sending anything, in milliseconds. */
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
 * closes, or the provider is silent for longer than the limits allow.
 *
 * @throws KindedError `unavailable` when the provider can't be reached or doesn't start its reply in time
 */
export async function passThrough(
  context: BridgeRequestContext,
  upstream: UpstreamRequest,
  caller: UpstreamCaller,
): Promise<void> {
  const { limits } = caller;
  const timedOut = new AbortController();
  let timer = setTimeout(() => timedOut.abort(), limits.responseTimeoutMs);
  const restartTimer = (ms: number) => {
    clearTimeout(timer);
    timer = setTimeout(() => timedOut.abort(), ms);
  };
  const signal = AbortSignal.any([context.signal, timedOut.signal]);

  try {
    const reply = await callProvider(upstream, caller.fetch, signal, timedOut.signal, limits);
    context.response.writeHead(reply.status, replyHeaders(reply.headers, upstream.replyHeader));
    // Send the status now: a program waiting on a stream shouldn't wait for its first event too.
    context.response.flushHeaders();
    if (reply.body !== null) {
      const reader = reply.body.getReader();
      for (;;) {
        restartTimer(limits.idleTimeoutMs);
        const { done, value } = await reader.read();
        if (done) break;
        if (!context.response.write(value)) await once(context.response, "drain", { signal });
      }
    }
    context.response.end();
  } finally {
    clearTimeout(timer);
  }
}

/** Calls the provider and waits for its reply to start. */
async function callProvider(
  upstream: UpstreamRequest,
  fetch: Fetch,
  signal: AbortSignal,
  timedOut: AbortSignal,
  limits: UpstreamLimits,
): Promise<Response> {
  try {
    return await fetch(upstream.url, {
      method: "POST",
      headers: upstream.headers,
      body: upstream.body,
      signal,
    });
  } catch (cause) {
    if (timedOut.aborted) {
      const seconds = limits.responseTimeoutMs / 1000;
      throw new KindedError(
        "unavailable",
        `${upstream.provider} didn't answer within ${seconds} seconds.`,
        { cause },
      );
    }
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
