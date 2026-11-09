/** Version of the {@link HttpClient} port. A breaking change bumps it and comes with an ADR. */
export const httpClientVersion = 1;

/**
 * Outbound HTTP for adapters and the host: model APIs, HTTP connectors,
 * Google, webhooks. Replaces the old `FetchLike`. The same signature as the
 * Web `fetch`, so most adapters wrap it directly. Some refuse addresses:
 * the container target refuses loopback, link-local and private addresses
 * unless a connector is explicitly allowed.
 *
 * An adapter that refuses addresses checks every redirect hop, and the
 * address a host name resolves to when it connects, not only the first URL.
 * Otherwise a redirect or a DNS answer that changes between check and
 * connect (DNS rebinding) gets around it.
 *
 * Every adapter passes `init.redirect` and `init.signal` through to the
 * request. Callers rely on both: `redirect: "error"` keeps a bearer token
 * from following a redirect to another address, and `signal` is how they
 * put a time limit on a request.
 */
export interface HttpClient {
  /**
   * Sends one request. An HTTP error status still resolves; check `ok`.
   *
   * @throws when the network fails, the request is aborted or the address is refused
   */
  fetch(url: string, init?: RequestInit): Promise<Response>;
}
