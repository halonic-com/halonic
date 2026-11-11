import { lookup as dnsLookup } from "node:dns/promises";
import type { AddressCheckingHttpClient, HostClass } from "@halonicjs/adapter-http-kit";
import type { HttpClient } from "@halonicjs/ports";
import { AddressRefusedError } from "./address-refused.ts";
import { checkedAddresses, fixedLookup, type Resolve } from "./checked-addresses.ts";
import { type PreparedRequest, sendOnce } from "./send-once.ts";

/** What the Node transport needs to know about the hosts it may reach. */
export interface NodeHttpOptions {
  /**
   * The class of the URL's host: `public`, `private` (a home-network host the
   * user typed) or `loopback` (this computer). Undefined refuses the host
   * before any lookup. Asked again on every redirect hop.
   */
  readonly hostClass: (url: URL) => HostClass | undefined;
  /**
   * Halonic's own ports on this computer, which no request may reach: serve,
   * the agent bridge, the desktop agent host, srt's proxy ports and the
   * canary port. Read on every request, since they change while it runs.
   */
  readonly ownPorts?: () => Iterable<number>;
  /** Looks up a name's addresses; Node's `dns.lookup` by default. Tests pass a fake resolver. */
  readonly resolve?: Resolve;
  /** How many redirects `redirect: "follow"` takes. Default 20, as `fetch`. */
  readonly maxRedirects?: number;
}

const redirectStatuses = new Set([301, 302, 303, 307, 308]);

/** Headers that only the origin they were set for may see. */
const originBoundHeaders = ["authorization", "cookie", "proxy-authorization"];

/**
 * The Node `HttpClient` that refuses addresses (I5 design, HAL-958 section
 * 3.8). For every request and every redirect hop it resolves the name once,
 * checks every address against the host's class, and connects only to an
 * address it checked, so DNS rebinding can't get around it. It decompresses
 * responses itself. `redirect` and `signal` pass through as the port asks.
 * It is an `AddressCheckingHttpClient`, the transport the integration kit's
 * loader asks for.
 *
 * @example
 * const http = createNodeHttpClient({ hostClass: () => "public" });
 * const response = await http.fetch("https://api.example.com/v1", { redirect: "manual" });
 */
export function createNodeHttpClient(options: NodeHttpOptions): AddressCheckingHttpClient {
  const resolve = options.resolve ?? resolveWithNode;
  const maxRedirects = options.maxRedirects ?? 20;
  const client: HttpClient = {
    async fetch(rawUrl: string, init: RequestInit = {}): Promise<Response> {
      const mode = init.redirect ?? "follow";
      let url = new URL(rawUrl);
      let request = await prepare(url, init);
      for (let hops = 0; ; hops++) {
        const response = await sendChecked(url, request, init.signal ?? undefined);
        const location = response.headers.get("location");
        if (!redirectStatuses.has(response.status) || location === null || mode === "manual") {
          return response;
        }
        await response.body?.cancel();
        if (mode === "error") {
          throw new TypeError(`${url.host} redirected, and the request doesn't allow redirects`);
        }
        if (hops >= maxRedirects) {
          throw new TypeError(`${url.host} redirected more than ${maxRedirects} times`);
        }
        const next = new URL(location, url);
        request = redirected(request, response.status, url, next);
        url = next;
      }
    },
  };
  // This is the transport that checks addresses, so it is the one place that says so.
  return client as AddressCheckingHttpClient;

  async function sendChecked(
    url: URL,
    request: PreparedRequest,
    signal: AbortSignal | undefined,
  ): Promise<Response> {
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new TypeError(`only http and https are supported, not ${url.protocol}`);
    }
    const hostClass = options.hostClass(url);
    if (hostClass === undefined) {
      throw new AddressRefusedError(`${url.host} is not a host this client may reach`);
    }
    const target = {
      hostname: url.hostname.replace(/^\[|\]$/g, ""),
      port: Number(url.port || (url.protocol === "https:" ? 443 : 80)),
      hostClass,
    };
    const addresses = await checkedAddresses(target, resolve, new Set(options.ownPorts?.() ?? []));
    signal?.throwIfAborted();
    return sendOnce(url, request, fixedLookup(addresses), signal);
  }
}

/**
 * The method, headers and body as bytes. A Web `Request` reads the body the
 * way `fetch` does, so a string, `URLSearchParams` or form gets the same
 * bytes and `content-type` here. A streamed body needs `duplex` and is
 * refused, as the kit refuses it.
 */
async function prepare(url: URL, init: RequestInit): Promise<PreparedRequest> {
  const normalized = new Request(url, {
    method: init.method ?? "GET",
    headers: init.headers ?? {},
    body: init.body ?? null,
  });
  const body = normalized.body === null ? null : new Uint8Array(await normalized.arrayBuffer());
  return { method: normalized.method, headers: new Headers(normalized.headers), body };
}

/** The next hop's request, the way `fetch` changes it on a redirect. */
function redirected(request: PreparedRequest, status: number, from: URL, to: URL): PreparedRequest {
  const headers = new Headers(request.headers);
  if (to.origin !== from.origin) {
    for (const name of originBoundHeaders) headers.delete(name);
  }
  const toGet = status === 303 || ((status === 301 || status === 302) && request.method === "POST");
  if (!toGet) {
    return { ...request, headers };
  }
  for (const name of ["content-type", "content-length", "content-encoding", "content-language"]) {
    headers.delete(name);
  }
  return { method: request.method === "HEAD" ? "HEAD" : "GET", headers, body: null };
}

async function resolveWithNode(hostname: string): Promise<string[]> {
  const answer = await dnsLookup(hostname, { all: true, order: "verbatim" });
  return answer.map((entry) => entry.address);
}
