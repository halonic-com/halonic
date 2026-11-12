# server.api

- Status: active
- Since: 0.1.0
- Source: HAL-9 plan phase 4; build plan on HAL-195 (PR 1), approved by Liam on HAL-7816

The server package shall export the interface of the `Request → Response` handler behind `halonic serve` and the cloud Worker, and nothing else yet: a `Server` with one method, `handle(request)`; the `ServerConfig` a host decides; the `ServerPorts` it supplies; the `RequestCountStore` behind the daily request ceiling; the `ServerErrorBody` of every error, which holds a code and a short message only; and the type of the function that builds a server. Every outside dependency shall come in through a port from the ports package or through `RequestCountStore`, and the interface shall use only Web-standard types.

Rationale: the interface lands on its own first (AGENTS.md, "Plan first"), so the security layer, the sign-in, the routes and each host target can be built in parallel against it, and so the Node and Cloudflare targets share one handler and one set of tests.

## Examples

- Given a `Server`, when its type is read, then it has only `handle`, and `handle` takes a Web `Request` and answers a Web `Response`.
- Given a `ServerErrorBody`, when its type is read, then it has only `code` and `message`.
- Given `ServerPorts`, when its keys are read, then they are the run executor, secrets, password hasher, coordination, request counts, clock and ids, so the handler holds no state of its own.
