# @halonicjs/host-server

The `Request → Response` handler behind `halonic serve` and the cloud Worker. This first version holds only the interface (`Server`, `ServerConfig`, `ServerPorts`); the security layer, sign-in and routes follow in later pull requests. Web-standard APIs only, with every outside dependency behind a port.

- **Layer:** host
- **Owner:** elena
- **Public API:** `@halonicjs/host-server`

## Example

```ts
import type { Server, ServerOptions } from "@halonicjs/host-server";

// A host builds a server from its config and ports, then hands each request to `handle`.
declare const server: Server;
const response = await server.handle(new Request("http://localhost/api/hello"));
```
