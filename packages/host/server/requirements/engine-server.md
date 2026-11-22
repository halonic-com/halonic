# server.engine-server

- Status: active
- Since: unreleased
- Source: HAL-14230; B1 design note D3 on HAL-14206, security review on HAL-14212 (section 1); the chat-turn route from HAL-15894

Where the engine role serves its HTTP API, `createEngineServer` shall answer only the shell that launched it: before it looks at the path, it shall refuse a `Host` other than `127.0.0.1:<port>` or `localhost:<port>` with 421 `host_not_allowed`, any `Origin` header with 403 `origin_not_allowed`, and a request without `Authorization: Bearer <launch token>` with 401 `launch_token_required` and `WWW-Authenticate: Bearer`, comparing the token in constant time (`contracts.launch-token-refusal`). It shall have no sign-in, no password and no route served without the token, and it shall refuse to start with a token shorter than 32 random bytes as base64url. It shall serve, built from the route factories and never through `createServer`, exactly these routes: `GET /api/hello`, which answers only `{ "runExecutorVersion": … }` and names no product or version; `POST /api/runs`, `POST /api/agent-runs`, `GET /api/waiting-runs`, `GET /api/runs/<runId>`, `GET` and `POST /api/runs/<runId>/events`, `POST /api/runs/<runId>/cancel` (each as `serve` answers it, starts behind the trust gate and taking only JSON), `GET /api/run-updates` (`server.engine-run-updates`), the two routine routes (`server.engine-routines`) and `POST /api/chat-turn`, with `serve`'s own handler and every check it makes (`server.chat-turn`, `server.chat-turn-model-address`). The chat-turn route is the only engine route that may send a stored key to an address its caller names, and it may only because the engine role can't be built without the `modelSettings` port: a required port, not an optional one, that lets a secret go to an address only when a provider file of the trusted live version names that secret, with the same type, at that same address. Any other path answers 404 `not_found` to a caller with the token. A body over `maxBodyBytes` answers 413. An unexpected failure answers 500 with a fixed message, its cause going only to the error log, and every answer carries the security headers.

Rationale: another program or OS user on the computer can reach the loopback port, and only the token stops it. `createServer` also mounts trust, provider-key, webhook, connector-call, Google, workspace and page routes, some of them served without a sign-in, so the engine never uses it. Studio's Try it needs the chat-turn route when the shell runs the engine. Served there it sends a key only where a run of the trusted workspace could already send it, because the `modelSettings` check is required: with an optional port, an engine host could serve the route without it, and that would reopen what the security review on HAL-14212 closed.

## Examples

- Given a chat turn with the token whose settings send a stored key to an address no provider file of the trusted live version names, then it answers 400 `model_address_not_allowed` and makes no model call.
- Given a chat turn without the token, or with any `Origin`, then it answers 401 or 403 before the chat-turn handler runs, and makes no model call.
- Given a request to `/api/trust`, `/api/logout`, `/api/webhooks/acme/digest` or `/` with the token, then it answers 404.
- Given a request to any engine route without the token, then it answers 401, and nothing is started or read.
- Given the engine's route list, then it is exactly the twelve routes above.
- Given `GET /api/hello` with the token, then it answers only the run executor version.
- Given a launch token of 5 characters, then the server doesn't start.
