# @halonicjs/host-server

The `Request → Response` handler behind `halonic serve` and the cloud Worker. `createServer` builds the handler with its security layer: the `Host` check (loopback names only when no password is set), the exact `Origin` check, strict response headers, a body limit enforced while the body streams, and errors that are a code and a short message. Every path answers 404 for now; sign-in and routes follow in later pull requests. Web-standard APIs only, with every outside dependency behind a port.

- **Layer:** host
- **Owner:** elena
- **Public API:** `@halonicjs/host-server`

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
