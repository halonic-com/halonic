// Between Node's HTTP server and the routes, which speak Web `Request` and
// `Response` so they can run without Node too.

import { once } from "node:events";
import type { IncomingMessage, ServerResponse } from "node:http";

/**
 * The method, address and headers of a request Node's server took in, as
 * a Web `Request` without a body: a route reads the body through the
 * bridge, within its limits. Headers keep the values Node gave them, so a
 * second `authorization` is dropped as Node drops it.
 */
export function webRequestOf(request: IncomingMessage): Request {
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    if (value === undefined) continue;
    for (const each of Array.isArray(value) ? value : [value]) headers.append(name, each);
  }
  // The base only fills in a path-only target; an absolute one was checked already.
  const url = new URL(request.url ?? "/", "http://bridge");
  return new Request(url, { method: request.method ?? "GET", headers });
}

/**
 * Writes a route's reply to Node's response: the status and headers at
 * once, so a program waiting on a stream doesn't wait for its first event
 * too, then the body as it comes. It waits while the program isn't reading,
 * until the program reads again, the request ends or the body fails.
 *
 * @throws the body's error when it fails part way; the reply has begun then
 */
export async function writeReply(
  reply: Response,
  response: ServerResponse,
  signal: AbortSignal,
): Promise<void> {
  response.writeHead(reply.status, nodeHeadersOf(reply.headers));
  response.flushHeaders();
  if (reply.body === null) {
    response.end();
    return;
  }
  const reader = reply.body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!response.write(value)) {
        // A body that fails while the program isn't reading, such as when it ran out of time, ends the wait.
        await Promise.race([once(response, "drain", { signal }), reader.closed]);
      }
    }
  } catch (error) {
    // Let the body go, so a provider's reply behind it stops too. A body that
    // already failed refuses the cancel; its failure is the one rethrown here.
    await reader.cancel(error).catch(() => undefined);
    throw error;
  }
  response.end();
}

/**
 * A reply's headers as Node writes them. `Headers` joins a repeated header
 * into one value; `set-cookie` can't be joined, so each one stays apart.
 */
function nodeHeadersOf(headers: Headers): Record<string, string | string[]> {
  const written: Record<string, string | string[]> = Object.fromEntries(headers);
  const cookies = headers.getSetCookie();
  if (cookies.length > 0) written["set-cookie"] = cookies;
  return written;
}
