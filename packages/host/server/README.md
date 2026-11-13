# @halonicjs/host-server

The `Request → Response` handler behind `halonic serve` and the cloud Worker. `createServer` builds the handler with its security layer: the `Host` check (loopback names only when no password is set), the exact `Origin` check, strict response headers, a body limit enforced while the body streams, and errors that are a code and a short message. `GET /api/hello` and the sign-in routes answer; every other path answers 404 for now. Web-standard APIs only, with every outside dependency behind a port.

- **Layer:** host
- **Owner:** elena
- **Public API:** `@halonicjs/host-server`

## Daily request ceiling

A deployment can cap how many requests its server answers per UTC day. Set `limits.dailyRequests` on the deployment in `deployments.yaml` (a whole number above zero). There is no default: with no `dailyRequests`, nothing is counted and nothing is capped. The ceiling is the same on `halonic serve` and on Cloudflare.

- Every request that passes the `Host` and `Origin` checks counts, whether or not the caller has signed in. That includes `GET /api/hello` and the sign-in routes, so a caller who isn't signed in can use up the day.
- A request refused by the `Host` or `Origin` check doesn't count.
- A request past the ceiling gets status 429 with the code `daily_limit_reached` and a `Retry-After` header: the whole seconds until the next UTC midnight. It never reaches a route, so it never starts a run.

## `GET /api/hello`

Answers 200 without a sign-in, with exactly three keys:

```json
{ "product": "halonic", "version": "0.1.0", "minAppVersion": "0.1.0" }
```

`version` is the server's version and `minAppVersion` is the oldest Android app this server works with. The Android app calls the route before it opens the sign-in page, to check it can talk to this server. It tells nothing else: no workspace name, host name or user. It sits behind the same `Host` and `Origin` checks and the same ceiling as every other route.

## Example

```ts
import { createServer, type ServerOptions } from "@halonicjs/host-server";

// A host builds a server from its config and ports, then hands each request to `handle`.
declare const options: ServerOptions;
const server = createServer(options);
const response = await server.handle(
  new Request("http://localhost/api/hello", { headers: { host: "localhost" } }),
);
```
