# @halonicjs/adapter-http-node

The Node `HttpClient` for outgoing requests that refuses addresses (I5 design, HAL-958 section
3.8). It is built on `node:http` and `node:https` with its own lookup, because Node's `fetch`
gives no hook between the DNS lookup and the connection.

- **Layer:** adapters
- **Owner:** ravi
- **Runtime:** node
- **Public API:** `@halonicjs/adapter-http-node`

## What it checks

For every request and every redirect hop, `createNodeHttpClient({ hostClass, ownPorts, resolve })`:

1. asks `hostClass(url)` for the host's class: `public`, `private` (a home-network host the user
   typed) or `loopback` (this computer). A host with no class is refused before any lookup.
2. refuses one of Halonic's own ports (`ownPorts()`, read on every request) on a `loopback` host.
3. resolves the name **once** and checks **every** address of the answer with `http-kit`'s
   `addressAllowedFor`. Addresses outside the class are dropped. If none is left, nothing is sent.
   An IP address in the URL is checked as it is.
4. connects only to an address it checked: the lookup Node uses hands out those addresses and no
   others, so a second DNS answer can't change where the request goes.

A refusal throws `AddressRefusedError` with `code: "address-not-allowed"`.

**The URL decides the host, never a header.** The transport drops a caller's `host` header and
sends the URL's; for `https` to a name it checks the certificate against the URL's host. It also
drops `connection`, `keep-alive`, `transfer-encoding`, `te`, `upgrade`, `expect` and
`content-length`, and sets the framing itself.

`ownPorts` is checked on `loopback` hosts only. That holds while Halonic's own servers listen on
`127.0.0.1` alone: one that listened on the LAN address would be reachable through a `private`
host with this computer's LAN IP.

## What it does like `fetch`

- `redirect`: `manual` returns the `3xx`, `error` throws, `follow` (the default) takes up to 20
  hops, checks each one as above, drops `authorization`, `cookie` and `proxy-authorization` when
  the origin changes, and turns a `POST` into a `GET` on 301, 302 and 303. Other headers, such
  as `x-api-key`, go on to the new origin, so a caller that places secrets must use `manual`
  (the kit always does).
- `signal` aborts the request and the body.
- The body is read the way `fetch` reads it, so a string or `URLSearchParams` gets the same bytes
  and `content-type`. A streamed request body is refused.

**It decompresses responses itself** (`gzip`, `deflate`, `br`, `zstd`) and removes
`content-encoding` and `content-length`, so the kit's secret filter and size limit see the real
bytes. An encoding it can't undo fails the request.

## Example

The code lives in [`examples/refuse-private-answer.ts`](examples/refuse-private-answer.ts), where
it is typechecked and run by `src/example.test.ts`; keep this copy in step with it. Outside this
package, import `@halonicjs/adapter-http-node`.

```ts
import { AddressRefusedError, createNodeHttpClient } from "@halonicjs/adapter-http-node";

/** A public host whose name resolves to a private address is refused before anything is sent. */
export async function runExample(): Promise<string> {
  const http = createNodeHttpClient({
    // Only api.example.com is allowed, as a public host.
    hostClass: (url) => (url.hostname === "api.example.com" ? "public" : undefined),
    // A made-up DNS answer, as a rebinding attacker would give it.
    resolve: async () => ["10.0.0.5"],
  });
  try {
    await http.fetch("https://api.example.com/v1/items", { redirect: "manual" });
    return "sent";
  } catch (error) {
    if (error instanceof AddressRefusedError) {
      return error.code; // "address-not-allowed"
    }
    throw error;
  }
}
```
